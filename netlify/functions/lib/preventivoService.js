/**
 * Mantenimiento preventivo (Fase 4).
 * Un plan por tipo de unidad. El próximo servicio se recalcula cuando un
 * movimiento trae kilómetros u horómetro. El semáforo sale del estatus.
 */

import { v4 as uuidv4 } from 'uuid'
import { createOtService, puedeAbrirOT } from './otService.js'
import {
  planPreventivoToRow,
  rowToPlanPreventivo,
  rowToServicioProgramado,
  servicioProgramadoToRow,
} from './sheetsRepo.js'

const RANK = { PENDIENTE: 0, HECHO: 0, AVISO: 1, VENCIDO: 2 }
const MS_DIA = 86400000

export class PreventivoError extends Error {
  /**
   * @param {string} message
   * @param {number} [status]
   * @param {string} [code]
   */
  constructor(message, status = 400, code = 'PREVENTIVO') {
    super(message)
    this.name = 'PreventivoError'
    this.status = status
    this.code = code
  }
}

export function semaforoPreventivo(estatus) {
  const estado = String(estatus || '').toUpperCase()
  if (estado === 'VENCIDO') return { nivel: 'rojo', etiqueta: 'Vencido' }
  if (estado === 'AVISO') return { nivel: 'amarillo', etiqueta: 'En aviso' }
  return { nivel: 'verde', etiqueta: estado === 'HECHO' ? 'Hecho' : 'En tiempo' }
}

export function peorEstatus(a, b) {
  return (RANK[a] ?? 0) >= (RANK[b] ?? 0) ? a : b
}

function umbral(avisoPct) {
  const n = Number(avisoPct)
  if (!Number.isFinite(n) || n <= 0 || n > 100) return 0.8
  return n / 100
}

/**
 * Avance del intervalo. VENCIDO al llegar al próximo, AVISO al cruzar avisoPct.
 * @returns {'PENDIENTE' | 'AVISO' | 'VENCIDO' | null}
 */
export function estatusEje(actual, proximo, intervalo, avisoPct) {
  const cur = Number(actual)
  const due = Number(proximo)
  const step = Number(intervalo)
  if (!Number.isFinite(cur) || !Number.isFinite(due) || !Number.isFinite(step) || step <= 0) return null
  if (cur >= due) return 'VENCIDO'
  const avance = (cur - (due - step)) / step
  if (avance >= umbral(avisoPct)) return 'AVISO'
  return 'PENDIENTE'
}

export function numeroDe(value) {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(n) ? n : null
}

export function lecturaDeMovimiento(mov) {
  const ref = mov?.refrigerada && typeof mov.refrigerada === 'object' ? mov.refrigerada : {}
  return {
    km: numeroDe(mov?.kilometros ?? mov?.km),
    horometro: numeroDe(mov?.horometro ?? mov?.horometroThermo ?? ref.horometroThermo),
    fecha: mov?.horaServidor || mov?.fechaHora || mov?.creadoEn || '',
  }
}

export function combinarEstatus(plan, servicio, lectura, now = new Date()) {
  const ejes = []
  if (plan?.cadaKm != null && lectura?.km != null && servicio?.proximoKm != null) {
    const estatus = estatusEje(lectura.km, servicio.proximoKm, plan.cadaKm, plan.avisoPct)
    if (estatus) ejes.push({ eje: 'km', estatus })
  }
  if (plan?.cadaDias != null && servicio?.proximaFecha) {
    const due = Date.parse(servicio.proximaFecha)
    const cur = Date.parse(lectura?.fecha || '')
    const actual = Number.isFinite(cur) ? cur : now.getTime()
    if (Number.isFinite(due)) {
      const estatus = estatusEje(actual, due, Number(plan.cadaDias) * MS_DIA, plan.avisoPct)
      if (estatus) ejes.push({ eje: 'fecha', estatus })
    }
  }
  if (plan?.cadaHorasThermo != null && lectura?.horometro != null && servicio?.proximoHorometro != null) {
    const estatus = estatusEje(lectura.horometro, servicio.proximoHorometro, plan.cadaHorasThermo, plan.avisoPct)
    if (estatus) ejes.push({ eje: 'horometro', estatus })
  }
  const estatus = ejes.reduce((acc, item) => peorEstatus(acc, item.estatus), 'PENDIENTE')
  return { estatus, ejes }
}

export function avanzarNumero(actual, anterior, intervalo) {
  const step = Number(intervalo)
  if (!Number.isFinite(step) || step <= 0) return numeroDe(anterior)
  const base = numeroDe(actual) ?? numeroDe(anterior)
  if (base == null) return null
  let next = base + step
  const piso = numeroDe(actual)
  let guard = 0
  if (piso != null) {
    while (next <= piso && guard < 10000) {
      next += step
      guard += 1
    }
  }
  return next
}

export function avanzarFecha(fechaIso, anteriorIso, cadaDias, now = new Date()) {
  const step = Number(cadaDias) * MS_DIA
  if (!Number.isFinite(step) || step <= 0) return anteriorIso || ''
  const baseMs = Date.parse(fechaIso || '') 
  const anteriorMs = Date.parse(anteriorIso || '')
  const base = Number.isFinite(baseMs) ? baseMs : Number.isFinite(anteriorMs) ? anteriorMs : now.getTime()
  let next = base + step
  const piso = Number.isFinite(baseMs) ? baseMs : now.getTime()
  let guard = 0
  while (next <= piso && guard < 10000) {
    next += step
    guard += 1
  }
  return new Date(next).toISOString()
}

function norm(value) {
  return String(value ?? '').trim().toUpperCase()
}

function clockOf(options) {
  const fn = options?.now ?? (() => new Date())
  const value = fn()
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

/**
 * @param {Record<string, Function>} repo
 * @param {{ now?: () => Date, newId?: () => string, otService?: { createOT: Function, listOTs?: Function } }} [options]
 */
export function createPreventivoService(repo, options = {}) {
  function newId() {
    return options.newId ? options.newId() : uuidv4()
  }

  function otService() {
    if (options.otService) return options.otService
    return createOtService(repo, { now: options.now, newId: options.newId })
  }

  function exigirEdicion(session) {
    if (!session?.email) throw new PreventivoError('Sesión requerida.', 401, 'SESION')
    if (!puedeAbrirOT(session)) {
      throw new PreventivoError('No tienes permiso para abrir el preventivo.', 403, 'PERMISO')
    }
  }

  async function listarPlanes() {
    return repo.listPlanesPreventivo()
  }

  async function listarServicios() {
    return repo.listServiciosProgramados()
  }

  async function guardarServicio(servicio, nuevo) {
    const row = servicioProgramadoToRow(servicio)
    if (nuevo) await repo.appendServicioProgramado(row)
    else await repo.updateServicioProgramadoById(servicio.id, row)
    return rowToServicioProgramado(row)
  }

  function completarProximos(servicio, plan, lectura) {
    const next = { ...servicio }
    const fechaMs = Date.parse(lectura?.fecha || '')
    if (next.proximoKm == null && plan?.cadaKm != null && lectura?.km != null) {
      next.proximoKm = lectura.km + Number(plan.cadaKm)
    }
    if (!next.proximaFecha && plan?.cadaDias != null && Number.isFinite(fechaMs)) {
      next.proximaFecha = new Date(fechaMs + Number(plan.cadaDias) * MS_DIA).toISOString()
    }
    if (next.proximoHorometro == null && plan?.cadaHorasThermo != null && lectura?.horometro != null) {
      next.proximoHorometro = lectura.horometro + Number(plan.cadaHorasThermo)
    }
    return next
  }

  async function yardaDeUnidad(unidadId) {
    const want = norm(unidadId)
    if (typeof repo.listEstadoUnidad === 'function') {
      const estados = await repo.listEstadoUnidad()
      const estado = estados.find((item) => norm(item.unidadId) === want && item.yarda)
      if (estado?.yarda) return String(estado.yarda).trim().toLowerCase()
    }
    if (typeof repo.listMovimientos === 'function') {
      let yarda = ''
      for (const mov of await repo.listMovimientos()) {
        if (norm(mov.equipoId || mov.unidadId) === want && (mov.yardaId || mov.yarda)) {
          yarda = String(mov.yardaId || mov.yarda).trim().toLowerCase()
        }
      }
      if (yarda) return yarda
    }
    return ''
  }

  async function upsertPlan(session, input = {}) {
    exigirEdicion(session)
    const tipoUnidad = String(input.tipoUnidad || '').trim().toLowerCase()
    if (!tipoUnidad) throw new PreventivoError('Indica el tipo de unidad del plan.', 400, 'TIPO')
    const cadaKm = numeroDe(input.cadaKm)
    const cadaDias = numeroDe(input.cadaDias)
    const cadaHorasThermo = numeroDe(input.cadaHorasThermo)
    if (cadaKm == null && cadaDias == null && cadaHorasThermo == null) {
      throw new PreventivoError('Indica cada cuántos km, días u horas de thermo.', 400, 'PLAN')
    }
    for (const [label, value] of [['km', cadaKm], ['días', cadaDias], ['horas de thermo', cadaHorasThermo]]) {
      if (value != null && value <= 0) throw new PreventivoError(`El intervalo de ${label} tiene que ser mayor a cero.`, 400, 'PLAN')
    }
    const avisoRaw = input.avisoPct == null || input.avisoPct === '' ? 80 : numeroDe(input.avisoPct)
    if (avisoRaw == null || avisoRaw <= 0 || avisoRaw > 100) {
      throw new PreventivoError('El aviso es un porcentaje entre 1 y 100.', 400, 'AVISO')
    }
    const plan = { tipoUnidad, cadaKm, cadaDias, cadaHorasThermo, avisoPct: avisoRaw }
    const actuales = await listarPlanes()
    const previo = actuales.find((item) => item.tipoUnidad === tipoUnidad)
    const row = planPreventivoToRow(plan)
    if (previo) await repo.updatePlanPreventivoByTipo(tipoUnidad, row)
    else await repo.appendPlanPreventivo(row)
    return rowToPlanPreventivo(row)
  }

  async function sincronizarCierreOt(ot) {
    if (!ot?.id || typeof repo.listServiciosProgramados !== 'function') return []
    const servicios = (await listarServicios()).filter((item) => item.otId === ot.id && item.estatus !== 'HECHO')
    if (!servicios.length) return []
    const planes = typeof repo.listPlanesPreventivo === 'function' ? await listarPlanes() : []
    const ots = typeof repo.listOrdenesTrabajo === 'function' ? await repo.listOrdenesTrabajo() : []
    const cerrada = ots.find((item) => item.id === ot.id) || ot
    const ahora = clockOf(options)
    const hechos = []
    if (cerrada.estatus === 'CANCELADA' || ot.estatus === 'CANCELADA') {
      for (const servicio of servicios) {
        hechos.push(await guardarServicio({ ...servicio, otId: '' }, false))
      }
      return hechos
    }
    if (cerrada.estatus !== 'CERRADA' && ot.estatus !== 'CERRADA') return []
    for (const servicio of servicios) {
      const plan = planes.find((item) => item.tipoUnidad === servicio.planId)
      const hecho = await guardarServicio({ ...servicio, estatus: 'HECHO' }, false)
      hechos.push(hecho)
      if (!plan) continue
      const lectura = {
        km: numeroDe(cerrada.kmSalida) ?? numeroDe(cerrada.kmEntrada),
        horometro: numeroDe(cerrada.horometroSalida) ?? numeroDe(cerrada.horometroEntrada),
        fecha: cerrada.fechaLiberada || ahora.toISOString(),
      }
      const siguiente = {
        id: newId(),
        unidadId: servicio.unidadId,
        planId: servicio.planId,
        proximoKm: plan.cadaKm != null ? avanzarNumero(lectura.km, servicio.proximoKm, plan.cadaKm) : null,
        proximaFecha: plan.cadaDias != null ? avanzarFecha(lectura.fecha, servicio.proximaFecha, plan.cadaDias, ahora) : '',
        proximoHorometro: plan.cadaHorasThermo != null
          ? avanzarNumero(lectura.horometro, servicio.proximoHorometro, plan.cadaHorasThermo)
          : null,
        estatus: 'PENDIENTE',
        otId: '',
      }
      const combinado = combinarEstatus(plan, siguiente, lectura, ahora)
      siguiente.estatus = combinado.estatus
      hechos.push(await guardarServicio(siguiente, true))
    }
    return hechos
  }

  async function recalcularPorMovimiento(mov) {
    const lectura = lecturaDeMovimiento(mov)
    if (lectura.km == null && lectura.horometro == null) return { skipped: true, reason: 'sin_lectura' }
    const tipo = String(mov?.equipoTipo || mov?.tipoUnidad || '').trim().toLowerCase()
    if (!tipo) return { skipped: true, reason: 'sin_tipo' }
    const unidadId = String(mov?.equipoId || mov?.unidadId || '').trim()
    if (!unidadId) return { skipped: true, reason: 'sin_unidad' }
    const planes = await listarPlanes()
    const plan = planes.find((item) => item.tipoUnidad === tipo)
    if (!plan) return { skipped: true, reason: 'sin_plan' }

    const ahora = clockOf(options)
    if (!lectura.fecha) lectura.fecha = ahora.toISOString()
    let servicios = await listarServicios()
    let servicio = [...servicios].reverse().find((item) => norm(item.unidadId) === norm(unidadId) && item.planId === plan.tipoUnidad && item.estatus !== 'HECHO')

    if (servicio?.otId && typeof repo.listOrdenesTrabajo === 'function') {
      const ot = (await repo.listOrdenesTrabajo()).find((item) => item.id === servicio.otId)
      if (ot && (ot.estatus === 'CERRADA' || ot.estatus === 'CANCELADA')) {
        await sincronizarCierreOt(ot)
        servicios = await listarServicios()
        servicio = [...servicios].reverse().find((item) => norm(item.unidadId) === norm(unidadId) && item.planId === plan.tipoUnidad && item.estatus !== 'HECHO')
      }
    }

    const nuevo = !servicio
    const base = servicio || {
      id: newId(),
      unidadId,
      planId: plan.tipoUnidad,
      proximoKm: null,
      proximaFecha: '',
      proximoHorometro: null,
      estatus: 'PENDIENTE',
      otId: '',
    }
    const completado = completarProximos(base, plan, lectura)
    const combinado = combinarEstatus(plan, completado, lectura, ahora)
    const guardado = await guardarServicio({ ...completado, estatus: combinado.estatus }, nuevo)
    return { skipped: false, servicio: guardado, plan, ejes: combinado.ejes, lectura }
  }

  async function abrirOt(session, input = {}) {
    exigirEdicion(session)
    const servicioId = String(input.servicioId || input.id || '').trim()
    if (!servicioId) throw new PreventivoError('Indica el servicio preventivo.', 400, 'ID')
    const servicio = (await listarServicios()).find((item) => item.id === servicioId)
    if (!servicio) throw new PreventivoError('No se encontró el servicio programado.', 404, 'NOT_FOUND')
    if (servicio.estatus === 'HECHO') {
      throw new PreventivoError('Ese servicio ya está hecho.', 400, 'ESTATUS')
    }
    if (servicio.estatus !== 'AVISO' && servicio.estatus !== 'VENCIDO') {
      throw new PreventivoError('Solo se abre OT de un servicio en aviso o vencido.', 400, 'ESTATUS')
    }

    if (servicio.otId && typeof repo.listOrdenesTrabajo === 'function') {
      const abierta = (await repo.listOrdenesTrabajo()).find((item) => item.id === servicio.otId)
      if (abierta && abierta.estatus !== 'CERRADA' && abierta.estatus !== 'CANCELADA' && abierta.activo !== 'NO') {
        return { ot: abierta, servicio, linked: true }
      }
    }

    const yardaInput = String(input.yarda || input.yardaId || '').trim().toLowerCase()
    const yarda = yardaInput && yardaInput !== 'todas' ? yardaInput : await yardaDeUnidad(servicio.unidadId)
    if (!yarda) throw new PreventivoError('Indica la yarda para abrir la OT.', 400, 'YARDA')

    const ahora = clockOf(options)
    const proxima = Date.parse(servicio.proximaFecha || '')
    let etr = input.etr ? new Date(input.etr).toISOString() : ''
    if (input.etr && Number.isNaN(Date.parse(etr))) throw new PreventivoError('ETR no es una fecha válida.', 400, 'ETR')
    if (!etr) {
      etr = Number.isFinite(proxima) && proxima > ahora.getTime()
        ? new Date(proxima).toISOString()
        : new Date(ahora.getTime() + MS_DIA).toISOString()
    }
    const motivoDefault = servicio.estatus === 'VENCIDO'
      ? `Servicio preventivo vencido · plan ${servicio.planId}`
      : `Servicio preventivo en aviso · plan ${servicio.planId}`
    const motivo = String(input.motivo || motivoDefault).trim()
    const result = await otService().createOT(session, {
      unidadId: servicio.unidadId,
      tipo: 'PREVENTIVO',
      motivo,
      etr,
      yarda,
      kmEntrada: input.kmEntrada,
      horometroEntrada: input.horometroEntrada,
    })
    const guardado = await guardarServicio({ ...servicio, otId: result.ot.id }, false)
    return { ot: result.ot, servicio: guardado, linked: Boolean(result.linked), idempotent: Boolean(result.idempotent) }
  }

  async function listProximos(filtros = {}, now = clockOf(options)) {
    const yarda = filtros.yarda && filtros.yarda !== 'todas' ? String(filtros.yarda).trim().toLowerCase() : ''
    const [servicios, planes] = await Promise.all([listarServicios(), listarPlanes()])
    const activos = servicios.filter((item) => filtros.incluirHechos || item.estatus !== 'HECHO')
    const orden = { rojo: 0, amarillo: 1, verde: 2 }
    const items = []
    for (const servicio of activos) {
      const yardaUnidad = await yardaDeUnidad(servicio.unidadId)
      if (yarda && yardaUnidad && yardaUnidad !== yarda) continue
      const plan = planes.find((item) => item.tipoUnidad === servicio.planId) || null
      const semaforo = semaforoPreventivo(servicio.estatus)
      items.push({ ...servicio, yarda: yardaUnidad, plan, semaforo })
    }
    items.sort((a, b) => {
      const nivel = (orden[a.semaforo.nivel] ?? 9) - (orden[b.semaforo.nivel] ?? 9)
      if (nivel !== 0) return nivel
      return Date.parse(a.proximaFecha || '9999') - Date.parse(b.proximaFecha || '9999')
    })
    const resumen = { verde: 0, amarillo: 0, rojo: 0, total: items.length }
    for (const item of items) {
      if (resumen[item.semaforo.nivel] != null) resumen[item.semaforo.nivel] += 1
    }
    return { servicios: items, resumen, planes, generadoEn: now.toISOString() }
  }

  return {
    upsertPlan,
    recalcularPorMovimiento,
    abrirOt,
    listProximos,
    sincronizarCierreOt,
    semaforoPreventivo,
  }
}
