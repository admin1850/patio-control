/**
 * Gate de salida Fase 3.
 * Conserva el bloqueo de mantenimiento/baja y suma sello ciego, km, documentos y Thermo.
 * El cliente no manda `validadoGate`: el servidor escribe el cumplimiento.
 */

import { v4 as uuidv4 } from 'uuid'
import { createOtService, puedeAutorizarSalida } from './otService.js'
import { defectoToRow, findOpenEntradaIn } from './sheetsRepo.js'
import {
  MOTIVO_TRASLADO_TALLER,
  evaluarDocumentos,
  evaluarKm,
  evaluarSello,
  evaluarThermo,
  mensajeGate,
  resolverGate,
  ultimoKilometraje,
} from '../../../src/lib/salidaFuerte.js'

function bandera(value) {
  return value === true || value === 'SI' || value === 'true' || value === 1
}

function cumplimientoDe({ sello, docs, thermo, resolved }) {
  return {
    validadoGate: resolved.resultado === 'PERMITIDO',
    selloCoincide: sello.coincide,
    ...(docs.cartaPorteUuid ? { cartaPorteUuid: docs.cartaPorteUuid } : {}),
    ...(docs.licenciaFederal ? { licenciaFederal: docs.licenciaFederal } : {}),
    ...(thermo.presente ? { thermoRevisado: true } : {}),
    thermoAlerta: thermo.motivos.some((item) => item.codigo === 'THERMO_DELTA' || item.codigo === 'THERMO_DIESEL'),
    salidaFuerte: true,
    validacionServidor: true,
  }
}

/**
 * Pisa `cumplimiento.validadoGate` del cliente.
 * Con el gate caído (503 / sin pestañas) queda en false.
 */
export function aplicarCumplimientoServidor(mov, gate) {
  if (!mov || typeof mov !== 'object') return mov
  const prev = mov.cumplimiento && typeof mov.cumplimiento === 'object' && !Array.isArray(mov.cumplimiento)
    ? { ...mov.cumplimiento }
    : {}
  if (gate?.resultado === 'RAPIDO') {
    const motivo = String(mov.motivoRapido || prev.motivoRapido || '').trim()
    mov.rapido = true
    if (motivo) mov.motivoRapido = motivo
    mov.cumplimiento = {
      ...prev,
      rapido: true,
      ...(motivo ? { motivoRapido: motivo } : {}),
      validacionServidor: true,
      validadoGate: true,
      resultado: 'RAPIDO',
    }
    return mov
  }
  delete prev.validadoGate
  const validacionServidor = gate?.validacionServidor === true
  const flags = gate?.cumplimiento && typeof gate.cumplimiento === 'object' ? gate.cumplimiento : {}
  const serverOk = validacionServidor && gate?.resultado === 'PERMITIDO'
  mov.cumplimiento = {
    ...prev,
    ...(flags.cartaPorteUuid ? { cartaPorteUuid: flags.cartaPorteUuid } : {}),
    ...(flags.licenciaFederal ? { licenciaFederal: flags.licenciaFederal } : {}),
    ...(flags.thermoRevisado != null ? { thermoRevisado: flags.thermoRevisado } : {}),
    ...(flags.thermoAlerta != null ? { thermoAlerta: flags.thermoAlerta } : {}),
    ...(validacionServidor ? { salidaFuerte: true } : {}),
    validacionServidor,
    validadoGate: serverOk,
    ...(gate?.via ? { gateVia: gate.via } : {}),
  }
  if (validacionServidor) {
    mov.selloCoincideEntrada = flags.selloCoincide ?? null
    if (flags.selloCoincide != null) mov.cumplimiento.selloCoincide = flags.selloCoincide
  }
  return mov
}

async function leerHistorial(repo) {
  if (typeof repo?.listMovimientos !== 'function') return { ok: true, movimientos: null }
  try {
    const movimientos = await repo.listMovimientos()
    return { ok: true, movimientos: Array.isArray(movimientos) ? movimientos : [] }
  } catch (err) {
    if (Number(err?.status) === 503) return { ok: false, movimientos: null }
    throw err
  }
}

function fotosDefecto(item, mov) {
  const propias = (Array.isArray(item?.fotos) ? item.fotos : [])
    .map((foto) => (typeof foto === 'string' ? foto : foto?.url))
    .map((url) => String(url || '').trim())
    .filter((url) => url && !url.startsWith('data:'))
  if (propias.length) return propias
  const slot = item?.slotId || `dano-${item?.angulo}`
  return (Array.isArray(mov?.fotosEvidencia) ? mov.fotosEvidencia : [])
    .filter((foto) => foto?.slotId === slot && foto?.url && !String(foto.url).startsWith('data:'))
    .map((foto) => String(foto.url))
}

/** Agrega filas DANO_NUEVO. Si falta la pestaña, el caller decide no trabar la salida. */
export async function persistirDefectos(repo, session, mov, hora) {
  if (typeof repo?.appendDefecto !== 'function') return { count: 0, skipped: true }
  const items = Array.isArray(mov?.defectos) ? mov.defectos : []
  const ahora = hora || new Date().toISOString()
  const email = String(session?.email || mov?.usuarioEmail || '').trim().toLowerCase()
  let count = 0
  for (const item of items) {
    const tipo = String(item?.tipo || '').trim().toUpperCase()
    if (tipo !== 'DANO_NUEVO') continue
    const angulo = String(item?.angulo || '').trim()
    if (!angulo) continue
    await repo.appendDefecto(defectoToRow({
      id: String(item.id || '').trim() || uuidv4(),
      movimientoId: mov.id,
      equipoId: mov.equipoId,
      angulo,
      tipo: 'DANO_NUEVO',
      fotos: fotosDefecto(item, mov),
      otId: item.otId || '',
      usuarioEmail: email,
      horaServidor: ahora,
    }))
    count += 1
  }
  return { count }
}

/**
 * @param {object} repo
 * @param {{ otService?: object, now?: () => Date }} [options]
 */
export function createGateService(repo, options = {}) {
  const ot = options.otService || createOtService(repo, options)

  async function validarSalida(session, input = {}, callOpts = {}) {
    const auditar = callOpts.auditar !== false
    const baseInput = {
      equipoId: input.equipoId,
      unidadId: input.unidadId,
      placa: input.placa,
      relacionados: input.relacionados,
    }
    const mantenimiento = await ot.validarSalida(session, baseInput, { auditar: false, now: callOpts.now })
    const motivos = []
    if (mantenimiento.unidades?.length) {
      motivos.push({
        codigo: 'MANTENIMIENTO',
        mensaje: mantenimiento.mensaje,
      })
    }

    const equipoId = input.equipoId || input.unidadId
    const historial = await leerHistorial(repo)
    const movimientos = historial.movimientos
    const entrada = Array.isArray(movimientos) ? findOpenEntradaIn(movimientos, equipoId) : null
    const sello = evaluarSello({
      selloCapturado: input.selloCapturado ?? input.selloNumero,
      selloEntrada: historial.ok ? entrada?.selloNumero : '',
    })
    if (historial.ok && sello.motivo) motivos.push(sello.motivo)

    const ultimo = historial.ok && Array.isArray(movimientos) ? ultimoKilometraje(movimientos, equipoId) : null
    const km = evaluarKm(input.kilometros ?? input.km, ultimo)
    if (km.motivo) motivos.push(km.motivo)

    const docsInput = {
      cartaPorteUuid: input.cartaPorteUuid ?? input.cumplimiento?.cartaPorteUuid,
      licenciaFederal: input.licenciaFederal ?? input.cumplimiento?.licenciaFederal,
    }
    const docs = evaluarDocumentos(docsInput)
    motivos.push(...docs.motivos)

    const lleva = bandera(input.llevaRefrigerada) || bandera(entrada?.llevaRefrigerada)
    const thermo = evaluarThermo({
      ...input,
      llevaRefrigerada: lleva,
      refrigerada: input.refrigerada || entrada?.refrigerada,
    })
    motivos.push(...thermo.motivos)

    const puede = typeof mantenimiento.puedeAutorizar === 'boolean' ? mantenimiento.puedeAutorizar : puedeAutorizarSalida(session)
    const traslado = input.trasladoTallerExterno === true || input.motivo === MOTIVO_TRASLADO_TALLER || input.motivoSalida === MOTIVO_TRASLADO_TALLER
    const resolved = resolverGate({
      motivos,
      puedeAutorizar: puede,
      overrideMotivo: input.overrideMotivo,
      traslado,
    })

    const advertencias = [...resolved.advertencias]
    if (!historial.ok) {
      advertencias.push({
        codigo: 'HISTORIAL',
        mensaje: 'No se pudo leer el historial. El sello y los kilómetros no se compararon.',
      })
    }

    if (resolved.resultado === 'PERMITIDO' && mantenimiento.unidades?.length && auditar) {
      await ot.validarSalida(session, {
        ...baseInput,
        overrideMotivo: input.overrideMotivo,
        trasladoTallerExterno: traslado,
        motivo: input.motivo,
      }, { auditar: true, now: callOpts.now })
    } else if (resolved.resultado === 'PERMITIDO' && resolved.via === 'OVERRIDE' && auditar && typeof repo?.appendAuditoria === 'function') {
      try {
        await repo.appendAuditoria({
          usuarioEmail: String(session?.email || '').trim().toLowerCase(),
          rol: session?.rol || '',
          accion: 'override_salida',
          entidad: 'Salida',
          entidadId: String(equipoId || input.placa || ''),
          antes: advertencias,
          despues: { resultado: 'PERMITIDO', motivo: String(input.overrideMotivo || '').trim() },
          dispositivoId: session?.dispositivoId || '',
        })
      } catch (err) {
        console.warn('[gate] Auditoria no disponible:', err?.message || err)
      }
    }

    const cumplimiento = cumplimientoDe({ sello, docs, thermo, resolved })
    return {
      resultado: resolved.resultado,
      motivos: resolved.motivos,
      advertencias,
      unidades: mantenimiento.unidades || [],
      puedeAutorizar: puede,
      ...(resolved.via ? { via: resolved.via } : {}),
      mensaje: mensajeGate(resolved),
      cumplimiento,
      validacionServidor: true,
    }
  }

  return { validarSalida, esGateFuerte: true }
}
