/**
 * Órdenes de trabajo, ETR y estado operativo (Fase 1).
 * El estatus de la unidad solo cambia con un evento auditado:
 * apertura/cierre de OT, daño o baja.
 */

import { v4 as uuidv4 } from 'uuid'
import { normalizeRol } from './permisos.js'
import { estadoUnidadToRow, otEventoToRow, otToRow, rowToEstadoUnidad, rowToOt } from './sheetsRepo.js'

export const TIPOS_OT = Object.freeze([
  'CORRECTIVO',
  'PREVENTIVO',
  'LLANTAS',
  'THERMO',
  'CARROCERIA',
  'ELECTRICO',
  'OTRO',
])

export const ESTATUS_OT = Object.freeze([
  'ABIERTA',
  'DIAGNOSTICO',
  'ESPERA_REFACCION',
  'EN_REPARACION',
  'LISTA',
  'CERRADA',
  'CANCELADA',
])

export const ESTATUS_OT_ABIERTOS = Object.freeze([
  'ABIERTA',
  'DIAGNOSTICO',
  'ESPERA_REFACCION',
  'EN_REPARACION',
  'LISTA',
])

export const ESTATUS_OT_CIERRE = Object.freeze(['CERRADA', 'CANCELADA'])

export const TRANSICIONES_OT = Object.freeze({
  ABIERTA: ['DIAGNOSTICO', 'ESPERA_REFACCION', 'EN_REPARACION', 'LISTA', 'CERRADA', 'CANCELADA'],
  DIAGNOSTICO: ['ABIERTA', 'ESPERA_REFACCION', 'EN_REPARACION', 'LISTA', 'CERRADA', 'CANCELADA'],
  ESPERA_REFACCION: ['DIAGNOSTICO', 'EN_REPARACION', 'LISTA', 'CERRADA', 'CANCELADA'],
  EN_REPARACION: ['DIAGNOSTICO', 'ESPERA_REFACCION', 'LISTA', 'CERRADA', 'CANCELADA'],
  LISTA: ['EN_REPARACION', 'CERRADA', 'CANCELADA'],
  CERRADA: [],
  CANCELADA: [],
})

export const ESTATUS_OPERATIVO = Object.freeze(['DISPONIBLE', 'EN_MANTENIMIENTO', 'DANADO_NO_OPERABLE', 'BAJA'])

export const ESTATUS_BLOQUEAN_SALIDA = Object.freeze(['EN_MANTENIMIENTO', 'DANADO_NO_OPERABLE', 'BAJA'])

export const MOTIVO_TRASLADO_TALLER = 'TRASLADO_TALLER_EXTERNO'

export const PRIORIDADES_OT = Object.freeze(['BAJA', 'MEDIA', 'ALTA', 'URGENTE'])

const MIN_MOTIVO = 3
const MIN_OVERRIDE = 8
const DEDUPE_OVERRIDE_MS = 120_000

export class OtError extends Error {
  /**
   * @param {string} message
   * @param {number} [status]
   * @param {string} [code]
   */
  constructor(message, status = 400, code = 'OT') {
    super(message)
    this.name = 'OtError'
    this.status = status
    this.code = code
  }
}

export function puedeTransicion(desde, hacia) {
  return (TRANSICIONES_OT[desde] || []).includes(hacia)
}

export function etiquetaOperativo(estatus) {
  switch (estatus) {
    case 'DISPONIBLE':
      return 'Disponible'
    case 'EN_MANTENIMIENTO':
      return 'En mantenimiento'
    case 'DANADO_NO_OPERABLE':
      return 'Dañado, no operable'
    case 'BAJA':
      return 'Baja'
    default:
      return estatus || '—'
  }
}

/**
 * Semáforo del ETR: verde a tiempo, amarillo si faltan ≤24 h, rojo si ya venció.
 * @param {string | null | undefined} etr
 * @param {Date | number | string} [now]
 */
export function computeSemaforo(etr, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  const t = Date.parse(etr ?? '')
  if (!Number.isFinite(t)) {
    return { nivel: 'rojo', bucket: 'sin_etr', horas: null, etr: etr || null }
  }
  const horas = (t - nowMs) / 36e5
  if (horas < 0) return { nivel: 'rojo', bucket: 'vencido', horas, etr }
  if (horas <= 24) return { nivel: 'amarillo', bucket: 'por_vencer', horas, etr }
  return { nivel: 'verde', bucket: 'en_tiempo', horas, etr }
}

export function puedeVerMantenimiento(session) {
  return Boolean(session?.email)
}

/** Abrir y editar OT: encargado de yarda, patio, admin, o quien tenga permiso de parado. */
export function puedeAbrirOT(session) {
  if (!session?.email) return false
  const rol = normalizeRol(session.rol)
  if (rol === 'admin' || rol === 'encargado_yarda' || rol === 'patio') return true
  if (session.permisos?.parado) return true
  return false
}

export function puedeEditarOT(session) {
  return puedeAbrirOT(session)
}

/** El guardia ve el tablero. Mover el ETR queda para patio, encargado o admin. */
export function puedeCambiarEtr(session) {
  if (!puedeEditarOT(session)) return false
  return normalizeRol(session.rol) !== 'guardia'
}

export function puedeAutorizarSalida(session) {
  const rol = normalizeRol(session?.rol)
  return rol === 'admin' || rol === 'encargado_yarda'
}

export function puedeMarcarBaja(session) {
  const rol = normalizeRol(session?.rol)
  if (rol === 'admin' || rol === 'encargado_yarda') return true
  return Boolean(session?.permisos?.baja)
}

function emailOf(session) {
  return String(session?.email || '').trim().toLowerCase()
}

function norm(value) {
  return String(value ?? '').trim().toUpperCase()
}

function clockOf(options, callOpts) {
  const fn = callOpts?.now ?? options?.now ?? (() => new Date())
  const value = fn()
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return new Date()
  return date
}

function parseFecha(value, label) {
  if (value == null || String(value).trim() === '') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new OtError(`${label} no es una fecha válida.`, 400, 'FECHA')
  }
  return date.toISOString()
}

function fotosDe(raw) {
  if (raw == null || raw === '') return []
  const list = Array.isArray(raw) ? raw : [raw]
  return list
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item === 'object') return String(item.url || '').trim()
      return ''
    })
    .filter(Boolean)
}

export function normalizarRelacionados(raw) {
  if (raw == null || raw === '') return []
  const list = Array.isArray(raw) ? raw : [raw]
  const out = []
  for (const item of list) {
    if (item == null || item === '') continue
    if (typeof item === 'string') {
      const id = item.trim()
      if (id) out.push({ unidadId: id, placa: norm(id), tipo: '' })
      continue
    }
    if (typeof item !== 'object') continue
    const unidadId = String(item.unidadId || item.equipoId || item.id || '').trim()
    const placa = norm(item.placa)
    const tipo = String(item.tipo || item.equipoTipo || '').trim().toLowerCase()
    if (!unidadId && !placa) continue
    out.push({ unidadId: unidadId || placa, placa, tipo })
  }
  return out
}

function otAbierta(ot) {
  return ot && ot.activo !== 'NO' && ESTATUS_OT_ABIERTOS.includes(ot.estatus)
}

function otInvolucra(ot, key) {
  const want = norm(key)
  if (!want || !ot) return false
  if (norm(ot.unidadId) === want) return true
  for (const rel of ot.unidadesRelacionadasJson || []) {
    if (typeof rel === 'string') {
      if (norm(rel) === want) return true
      continue
    }
    if (norm(rel?.unidadId) === want || norm(rel?.placa) === want || norm(rel?.equipoId) === want) return true
  }
  return false
}

function clavesSalida(input) {
  const keys = new Set()
  const add = (value) => {
    const t = norm(value)
    if (t) keys.add(t)
  }
  add(input?.equipoId)
  add(input?.unidadId)
  add(input?.placa)
  for (const rel of normalizarRelacionados(input?.relacionados)) {
    add(rel.unidadId)
    add(rel.placa)
  }
  return keys
}

/**
 * @param {{ listOrdenesTrabajo: Function, appendOrdenTrabajo: Function, updateOrdenTrabajoById: Function, listOtEventos: Function, appendOtEvento: Function, listEstadoUnidad: Function, appendEstadoUnidad: Function, updateEstadoUnidadById: Function, appendAuditoria?: Function }} repo
 * @param {{ now?: () => Date, newId?: () => string }} [options]
 */
export function createOtService(repo, options = {}) {
  function newId() {
    return options.newId ? options.newId() : uuidv4()
  }

  async function leerOts() {
    return repo.listOrdenesTrabajo()
  }

  async function leerEstados() {
    return repo.listEstadoUnidad()
  }

  async function leerEventos() {
    return repo.listOtEventos()
  }

  function folioSiguiente(ots, now) {
    const year = now.getFullYear()
    const prefix = `OT-${year}-`
    let max = 0
    for (const ot of ots) {
      const match = String(ot.folio || '').match(new RegExp(`^OT-${year}-(\\d+)$`))
      if (match) max = Math.max(max, Number(match[1]))
    }
    return `${prefix}${String(max + 1).padStart(4, '0')}`
  }

  async function guardarOtNueva(ot) {
    const row = otToRow(ot)
    await repo.appendOrdenTrabajo(row)
    return rowToOt(row)
  }

  async function guardarOt(ot) {
    const row = otToRow(ot)
    await repo.updateOrdenTrabajoById(ot.id, row)
    return rowToOt(row)
  }

  async function guardarEstado(estado) {
    const row = estadoUnidadToRow(estado)
    const actuales = await leerEstados()
    const previo = actuales.find((item) => item.unidadId === estado.unidadId)
    if (previo) await repo.updateEstadoUnidadById(previo.unidadId, row)
    else await repo.appendEstadoUnidad(row)
    return rowToEstadoUnidad(row)
  }

  async function escribirEvento(evento) {
    const row = otEventoToRow(evento)
    await repo.appendOtEvento(row)
    return row
  }

  async function auditar(entry) {
    if (typeof repo.appendAuditoria !== 'function') return
    try {
      await repo.appendAuditoria(entry)
    } catch (err) {
      console.warn('[ot] Auditoria no disponible:', err?.message || err)
    }
  }

  function exigirSesion(session) {
    if (!session?.email) throw new OtError('Sesión requerida.', 401, 'SESION')
  }

  function exigirEdicion(session) {
    exigirSesion(session)
    if (!puedeEditarOT(session)) {
      throw new OtError('No tienes permiso para abrir o editar órdenes de trabajo.', 403, 'PERMISO')
    }
  }

  async function aplicarOperativo(session, { unidadId, nuevo, motivo, otId, meta = {}, ahora }) {
    const id = String(unidadId || '').trim()
    if (!id) throw new OtError('Falta la unidad.', 400, 'UNIDAD')
    const actuales = await leerEstados()
    const previo = actuales.find((item) => item.unidadId === id) || null
    const anterior = previo?.estatusOperativo || ''
    const desde = anterior === nuevo && previo?.desde ? previo.desde : ahora
    const estado = {
      unidadId: id,
      tipo: meta.tipo || previo?.tipo || '',
      yarda: meta.yarda || previo?.yarda || '',
      zona: meta.zona || previo?.zona || '',
      slot: meta.slot || previo?.slot || '',
      ubicacion: meta.ubicacion || previo?.ubicacion || '',
      estatusOperativo: nuevo,
      estatusCarga: meta.estatusCarga || previo?.estatusCarga || '',
      desde,
      otAbiertaId: otId == null ? previo?.otAbiertaId || '' : otId,
      actualizadoEn: ahora,
    }
    const guardado = await guardarEstado(estado)
    if (anterior !== nuevo) {
      await escribirEvento({
        id: newId(),
        otId: otId || previo?.otAbiertaId || '',
        tipoEvento: 'ESTATUS',
        valorAnterior: anterior,
        valorNuevo: nuevo,
        motivo: motivo || '',
        usuarioEmail: emailOf(session),
        horaServidor: ahora,
      })
      await auditar({
        usuarioEmail: emailOf(session),
        rol: session?.rol || '',
        accion: 'estatus_operativo',
        entidad: 'EstadoUnidad',
        entidadId: id,
        antes: { estatusOperativo: anterior },
        despues: { estatusOperativo: nuevo, otAbiertaId: guardado.otAbiertaId, motivo },
        dispositivoId: session?.dispositivoId || '',
      })
    }
    return guardado
  }

  function unidadesDeOt(ot) {
    const ids = []
    if (ot.unidadId) ids.push(ot.unidadId)
    for (const rel of normalizarRelacionados(ot.unidadesRelacionadasJson)) {
      if (rel.unidadId && !ids.some((id) => norm(id) === norm(rel.unidadId))) ids.push(rel.unidadId)
    }
    return ids
  }

  async function syncPorOt(session, ot, { abrir, ahora, motivo, detalle = {} }) {
    const ots = await leerOts()
    const estados = []
    for (const unidadId of unidadesDeOt(ot)) {
      const otras = ots.filter((item) => item.id !== ot.id && otAbierta(item) && otInvolucra(item, unidadId))
      const actual = (await leerEstados()).find((item) => norm(item.unidadId) === norm(unidadId))
      if (abrir) {
        if (actual?.estatusOperativo === 'BAJA') {
          throw new OtError(`La unidad ${unidadId} está dada de baja. No se abre OT.`, 409, 'BAJA')
        }
        const nuevo = actual?.estatusOperativo === 'DANADO_NO_OPERABLE' ? 'DANADO_NO_OPERABLE' : 'EN_MANTENIMIENTO'
        estados.push(
          await aplicarOperativo(session, {
            unidadId: actual?.unidadId || unidadId,
            nuevo,
            motivo: motivo || 'apertura_ot',
            otId: ot.id,
            meta: {
              tipo: detalle[norm(unidadId)]?.tipo || actual?.tipo || '',
              yarda: ot.yarda,
              zona: detalle[norm(unidadId)]?.zona || '',
              slot: detalle[norm(unidadId)]?.slot || '',
              ubicacion: detalle[norm(unidadId)]?.ubicacion || '',
            },
            ahora,
          }),
        )
        continue
      }
      if (otras.length) {
        const otra = otras[0]
        const nuevo = actual?.estatusOperativo === 'DANADO_NO_OPERABLE' || actual?.estatusOperativo === 'BAJA'
          ? actual.estatusOperativo
          : 'EN_MANTENIMIENTO'
        estados.push(
          await aplicarOperativo(session, {
            unidadId: actual?.unidadId || unidadId,
            nuevo,
            motivo: motivo || 'ot_relacionada',
            otId: otra.id,
            meta: { yarda: otra.yarda || ot.yarda },
            ahora,
          }),
        )
        continue
      }
      const nuevo =
        actual?.estatusOperativo === 'DANADO_NO_OPERABLE' || actual?.estatusOperativo === 'BAJA'
          ? actual.estatusOperativo
          : 'DISPONIBLE'
      estados.push(
        await aplicarOperativo(session, {
          unidadId: actual?.unidadId || unidadId,
          nuevo,
          motivo: motivo || 'cierre_ot',
          otId: '',
          meta: { yarda: ot.yarda },
          ahora,
        }),
      )
    }
    return estados
  }

  async function createOT(session, input = {}) {
    exigirEdicion(session)
    const ahoraDate = clockOf(options)
    const ahora = ahoraDate.toISOString()
    const id = String(input.id || '').trim() || newId()
    const existentes = await leerOts()
    const misma = existentes.find((ot) => ot.id === id)
    if (misma) {
      return { ot: misma, idempotent: true, linked: false, estado: null }
    }

    const unidadId = String(input.unidadId || input.equipoId || '').trim()
    if (!unidadId) throw new OtError('Indica la unidad de la orden de trabajo.', 400, 'UNIDAD')
    const tipo = String(input.tipo || '').trim().toUpperCase()
    if (!TIPOS_OT.includes(tipo)) {
      throw new OtError('Tipo de OT no válido. Usa correctivo, preventivo, llantas, thermo, carrocería, eléctrico u otro.', 400, 'TIPO')
    }
    const motivo = String(input.motivo || '').trim()
    if (motivo.length < MIN_MOTIVO) throw new OtError('El motivo es obligatorio.', 400, 'MOTIVO')
    const etr = parseFecha(input.etr, 'ETR')
    if (!etr) throw new OtError('El ETR es obligatorio en el primer guardado.', 400, 'ETR')
    const yarda = String(input.yarda || input.yardaId || '').trim().toLowerCase()
    if (!yarda) throw new OtError('Indica la yarda.', 400, 'YARDA')

    const fotos = fotosDe(input.fotosAntesJson ?? input.fotosAntes)
    if (fotos.some((url) => url.startsWith('data:'))) {
      throw new OtError('Las fotos deben ser URLs (https o /api/media), no archivos embebidos.', 400, 'FOTOS')
    }
    if (fotos.length === 1) throw new OtError('Si adjuntas fotos, mínimo 2 URLs.', 400, 'FOTOS')

    const prioridadRaw = String(input.prioridad || 'MEDIA').trim().toUpperCase()
    if (!PRIORIDADES_OT.includes(prioridadRaw)) throw new OtError('Prioridad no válida.', 400, 'PRIORIDAD')
    const tallerTipo = String(input.tallerTipo || 'INTERNO').trim().toUpperCase()
    if (!['INTERNO', 'EXTERNO'].includes(tallerTipo)) throw new OtError('El taller debe ser interno o externo.', 400, 'TALLER')

    if (!input.forzarNueva) {
      const abierta = existentes.find((ot) => otAbierta(ot) && norm(ot.unidadId) === norm(unidadId))
      if (abierta) return { ot: abierta, idempotent: false, linked: true, estado: null }
    }

    let relacionadas = normalizarRelacionados(input.unidadesRelacionadasJson ?? input.unidadesRelacionadas)
    const placa = norm(input.placa)
    if (placa && placa !== norm(unidadId) && !relacionadas.some((rel) => norm(rel.placa || rel.unidadId) === placa)) {
      relacionadas = [...relacionadas, { unidadId: placa, placa, tipo: 'placa' }]
    }

    const estadosPrevios = await leerEstados()
    for (const idUnidad of [unidadId, ...relacionadas.map((rel) => rel.unidadId)]) {
      const actual = estadosPrevios.find((item) => norm(item.unidadId) === norm(idUnidad))
      if (actual?.estatusOperativo === 'BAJA') {
        throw new OtError(`La unidad ${actual.unidadId} está dada de baja. No se abre OT.`, 409, 'BAJA')
      }
    }

    const ot = {
      id,
      folio: folioSiguiente(existentes, ahoraDate),
      unidadId,
      unidadesRelacionadasJson: relacionadas,
      yarda,
      tipo,
      motivo,
      prioridad: prioridadRaw,
      tallerTipo,
      proveedorId: String(input.proveedorId || '').trim(),
      ubicacionTaller: String(input.ubicacionTaller || '').trim(),
      responsableEmail: String(input.responsableEmail || '').trim().toLowerCase(),
      reportadoPor: emailOf(session),
      fechaEntradaTaller: parseFecha(input.fechaEntradaTaller, 'Fecha de entrada a taller') || ahora,
      etr,
      fechaLista: '',
      fechaLiberada: '',
      estatus: 'ABIERTA',
      kmEntrada: input.kmEntrada ?? null,
      kmSalida: input.kmSalida ?? null,
      horometroEntrada: input.horometroEntrada ?? null,
      horometroSalida: input.horometroSalida ?? null,
      costoEstimado: input.costoEstimado ?? null,
      costoRefacciones: input.costoRefacciones ?? null,
      costoManoObra: input.costoManoObra ?? null,
      costoExterno: input.costoExterno ?? null,
      factura: String(input.factura || '').trim(),
      refaccionesJson: Array.isArray(input.refaccionesJson) ? input.refaccionesJson : [],
      fotosAntesJson: fotos,
      fotosDespuesJson: fotosDe(input.fotosDespuesJson ?? input.fotosDespues),
      notas: String(input.notas || '').trim(),
      movimientoOrigenId: String(input.movimientoOrigenId || '').trim(),
      etrOriginal: etr,
      etrMovimientosCount: 0,
      activo: 'SI',
    }

    const guardada = await guardarOtNueva(ot)
    await escribirEvento({
      id: newId(),
      otId: guardada.id,
      tipoEvento: 'ESTATUS',
      valorAnterior: '',
      valorNuevo: 'ABIERTA',
      motivo,
      usuarioEmail: emailOf(session),
      horaServidor: ahora,
    })
    const detalle = {
      [norm(unidadId)]: {
        tipo: String(input.equipoTipo || input.tipoUnidad || '').trim(),
        ubicacion: String(input.zonaSlot || input.ubicacion || '').trim(),
        zona: String(input.zona || '').trim(),
        slot: String(input.slot || '').trim(),
      },
    }
    const estados = await syncPorOt(session, guardada, { abrir: true, ahora, motivo: 'apertura_ot', detalle })
    await auditar({
      usuarioEmail: emailOf(session),
      rol: session.rol || '',
      accion: 'crear_ot',
      entidad: 'OrdenTrabajo',
      entidadId: guardada.id,
      despues: { folio: guardada.folio, unidadId, etr, tipo },
      dispositivoId: session.dispositivoId || '',
    })
    return { ot: guardada, idempotent: false, linked: false, estado: estados[0] || null, estados }
  }

  async function getOT(id) {
    const want = String(id || '').trim()
    if (!want) throw new OtError('Falta el id de la OT.', 400, 'ID')
    const ot = (await leerOts()).find((item) => item.id === want)
    if (!ot || ot.activo === 'NO') throw new OtError('No se encontró la orden de trabajo.', 404, 'NOT_FOUND')
    const eventos = (await leerEventos()).filter((ev) => ev.otId === ot.id)
    return { ot, eventos }
  }

  async function listOTs(filtros = {}) {
    let ordenes = (await leerOts()).filter((ot) => ot.activo !== 'NO' || filtros.includeInactivas)
    if (!filtros.includeInactivas) ordenes = ordenes.filter((ot) => ot.activo !== 'NO')
    if (filtros.yarda && filtros.yarda !== 'todas') {
      const yarda = String(filtros.yarda).trim().toLowerCase()
      ordenes = ordenes.filter((ot) => ot.yarda === yarda)
    }
    if (filtros.unidadId) {
      const key = norm(filtros.unidadId)
      ordenes = ordenes.filter((ot) => otInvolucra(ot, key))
    }
    if (filtros.estatus) {
      const estatus = String(filtros.estatus).trim().toUpperCase()
      ordenes = ordenes.filter((ot) => ot.estatus === estatus)
    }
    if (filtros.soloAbiertas) ordenes = ordenes.filter((ot) => otAbierta(ot))
    return ordenes
  }

  async function exigirOtEditable(session, id) {
    exigirEdicion(session)
    const { ot } = await getOT(id)
    if (ESTATUS_OT_CIERRE.includes(ot.estatus)) {
      throw new OtError('La orden ya está cerrada o cancelada.', 400, 'ESTATUS')
    }
    return ot
  }

  async function updateEstatus(session, id, input = {}) {
    const ot = await exigirOtEditable(session, id)
    const hacia = String(input.estatus || '').trim().toUpperCase()
    if (!ESTATUS_OT.includes(hacia)) throw new OtError('Estatus de OT no válido.', 400, 'ESTATUS')
    if (hacia === ot.estatus) return { ot, estado: null, unchanged: true }
    if (!puedeTransicion(ot.estatus, hacia)) {
      throw new OtError(`No se puede pasar de ${ot.estatus} a ${hacia}.`, 400, 'TRANSICION')
    }
    const ahora = clockOf(options).toISOString()
    const next = {
      ...ot,
      estatus: hacia,
      etrOriginal: ot.etrOriginal || ot.etr,
    }
    if (hacia === 'LISTA' && !ot.fechaLista) next.fechaLista = ahora
    if (hacia === 'CERRADA') next.fechaLiberada = ahora
    const guardada = await guardarOt(next)
    await escribirEvento({
      id: newId(),
      otId: guardada.id,
      tipoEvento: 'ESTATUS',
      valorAnterior: ot.estatus,
      valorNuevo: hacia,
      motivo: String(input.motivo || '').trim(),
      usuarioEmail: emailOf(session),
      horaServidor: ahora,
    })
    let estados = []
    if (ESTATUS_OT_CIERRE.includes(hacia)) {
      estados = await syncPorOt(session, guardada, { abrir: false, ahora, motivo: hacia === 'CERRADA' ? 'cierre_ot' : 'cancelacion_ot' })
    }
    return { ot: guardada, estado: estados[0] || null, estados, unchanged: false }
  }

  async function updateEtr(session, id, input = {}) {
    exigirEdicion(session)
    if (!puedeCambiarEtr(session)) {
      throw new OtError('El guardia puede ver el tablero, pero no puede mover el ETR.', 403, 'PERMISO')
    }
    const motivo = String(input.motivo || '').trim()
    if (motivo.length < MIN_MOTIVO) throw new OtError('Mover el ETR exige un motivo.', 400, 'MOTIVO')
    const ot = await exigirOtEditable(session, id)
    const etr = parseFecha(input.etr, 'ETR')
    if (!etr) throw new OtError('Indica el nuevo ETR.', 400, 'ETR')
    if (etr === ot.etr) return { ot, unchanged: true }
    const ahora = clockOf(options).toISOString()
    const guardada = await guardarOt({
      ...ot,
      etr,
      etrOriginal: ot.etrOriginal || ot.etr,
      etrMovimientosCount: (Number(ot.etrMovimientosCount) || 0) + 1,
    })
    await escribirEvento({
      id: newId(),
      otId: guardada.id,
      tipoEvento: 'ETR',
      valorAnterior: ot.etr,
      valorNuevo: etr,
      motivo,
      usuarioEmail: emailOf(session),
      horaServidor: ahora,
    })
    await auditar({
      usuarioEmail: emailOf(session),
      rol: session.rol || '',
      accion: 'mover_etr',
      entidad: 'OrdenTrabajo',
      entidadId: guardada.id,
      antes: { etr: ot.etr },
      despues: { etr, motivo, etrMovimientosCount: guardada.etrMovimientosCount },
      dispositivoId: session.dispositivoId || '',
    })
    return { ot: guardada, unchanged: false }
  }

  async function registrarEstatusOperativo(session, input = {}) {
    exigirEdicion(session)
    const nuevo = String(input.estatusOperativo || '').trim().toUpperCase()
    if (!['DANADO_NO_OPERABLE', 'BAJA'].includes(nuevo)) {
      throw new OtError('Solo se registra daño no operable o baja por este evento.', 400, 'ESTATUS')
    }
    if (nuevo === 'BAJA' && !puedeMarcarBaja(session)) {
      throw new OtError('No tienes permiso para dar de baja la unidad.', 403, 'PERMISO')
    }
    const motivo = String(input.motivo || '').trim()
    if (motivo.length < MIN_MOTIVO) throw new OtError('El motivo es obligatorio.', 400, 'MOTIVO')
    const ahora = clockOf(options).toISOString()
    const estado = await aplicarOperativo(session, {
      unidadId: input.unidadId || input.equipoId,
      nuevo,
      motivo,
      otId: input.otId || null,
      meta: {
        tipo: input.tipo || input.equipoTipo,
        yarda: input.yarda,
        zona: input.zona,
        slot: input.slot,
        ubicacion: input.ubicacion,
      },
      ahora,
    })
    return { estado }
  }

  function armarBloqueos(estados, ots, keys) {
    const hits = []
    const vistos = new Set()
    for (const estado of estados) {
      if (!keys.has(norm(estado.unidadId))) continue
      if (!ESTATUS_BLOQUEAN_SALIDA.includes(estado.estatusOperativo)) continue
      vistos.add(norm(estado.unidadId))
      const ot = ots.find((item) => otAbierta(item) && (item.id === estado.otAbiertaId || otInvolucra(item, estado.unidadId)))
      hits.push({
        unidadId: estado.unidadId,
        estatusOperativo: estado.estatusOperativo,
        otAbiertaId: estado.otAbiertaId || ot?.id || '',
        folio: ot?.folio || '',
        yarda: estado.yarda || ot?.yarda || '',
      })
    }
    for (const ot of ots) {
      if (!otAbierta(ot)) continue
      const toca = [...keys].some((key) => otInvolucra(ot, key))
      if (!toca || vistos.has(norm(ot.unidadId))) continue
      vistos.add(norm(ot.unidadId))
      hits.push({
        unidadId: ot.unidadId,
        estatusOperativo: 'EN_MANTENIMIENTO',
        otAbiertaId: ot.id,
        folio: ot.folio || '',
        yarda: ot.yarda || '',
      })
    }
    return hits
  }

  function mensajeBloqueo(hits) {
    const partes = hits.map((hit) => {
      const folio = hit.folio ? ` (${hit.folio})` : ''
      return `${hit.unidadId}: ${etiquetaOperativo(hit.estatusOperativo)}${folio}`
    })
    return `Salida bloqueada. ${partes.join(' · ')}. Solo sale con traslado a taller externo o autorización del encargado de yarda.`
  }

  async function auditarOverride(session, hits, motivo, ahora) {
    const email = emailOf(session)
    const ahoraMs = Date.parse(ahora)
    const existentes = await leerEventos()
    let wrote = false
    for (const hit of hits) {
      const valorNuevo = `PERMITIDO|${hit.unidadId}`
      const reciente = existentes.some((ev) => {
        if (ev.tipoEvento !== 'OVERRIDE_SALIDA') return false
        if (String(ev.otId || '') !== String(hit.otAbiertaId || '')) return false
        if (ev.motivo !== motivo || ev.valorNuevo !== valorNuevo) return false
        if (String(ev.usuarioEmail || '').toLowerCase() !== email) return false
        const t = Date.parse(ev.horaServidor || '')
        return Number.isFinite(t) && Math.abs(ahoraMs - t) < DEDUPE_OVERRIDE_MS
      })
      if (reciente) continue
      await escribirEvento({
        id: newId(),
        otId: hit.otAbiertaId || '',
        tipoEvento: 'OVERRIDE_SALIDA',
        valorAnterior: hit.estatusOperativo,
        valorNuevo,
        motivo,
        usuarioEmail: email,
        horaServidor: ahora,
      })
      wrote = true
    }
    if (!wrote) return
    await auditar({
      usuarioEmail: email,
      rol: session?.rol || '',
      accion: motivo === MOTIVO_TRASLADO_TALLER ? 'traslado_taller_externo' : 'override_salida',
      entidad: 'Salida',
      entidadId: hits.map((hit) => hit.unidadId).join(','),
      antes: hits,
      despues: { resultado: 'PERMITIDO', motivo },
      dispositivoId: session?.dispositivoId || '',
    })
  }

  /**
   * @returns {Promise<{ resultado: 'PERMITIDO' | 'BLOQUEADO' | 'REQUIERE_AUTORIZACION', unidades: object[], puedeAutorizar: boolean, mensaje: string, via?: string }>}
   */
  async function validarSalida(session, input = {}, callOpts = {}) {
    exigirSesion(session)
    const keys = clavesSalida(input)
    if (!keys.size) throw new OtError('Indica la unidad que va a salir.', 400, 'UNIDAD')
    const [estados, ots] = await Promise.all([leerEstados(), leerOts()])
    const unidades = armarBloqueos(estados, ots, keys)
    const puede = puedeAutorizarSalida(session)
    if (!unidades.length) {
      return { resultado: 'PERMITIDO', unidades: [], puedeAutorizar: puede, mensaje: 'Salida permitida.' }
    }

    const motivo = String(input.overrideMotivo || '').trim()
    const traslado = input.trasladoTallerExterno === true || input.motivo === MOTIVO_TRASLADO_TALLER || motivo === MOTIVO_TRASLADO_TALLER
    const auditarExcepcion = callOpts.auditar !== false
    const ahora = clockOf(options, callOpts).toISOString()

    if (traslado && motivo !== MOTIVO_TRASLADO_TALLER) {
      if (auditarExcepcion) await auditarOverride(session, unidades, MOTIVO_TRASLADO_TALLER, ahora)
      return {
        resultado: 'PERMITIDO',
        unidades,
        puedeAutorizar: puede,
        via: MOTIVO_TRASLADO_TALLER,
        mensaje: 'Salida permitida por traslado a taller externo.',
      }
    }
    if (motivo === MOTIVO_TRASLADO_TALLER) {
      if (auditarExcepcion) await auditarOverride(session, unidades, MOTIVO_TRASLADO_TALLER, ahora)
      return {
        resultado: 'PERMITIDO',
        unidades,
        puedeAutorizar: puede,
        via: MOTIVO_TRASLADO_TALLER,
        mensaje: 'Salida permitida por traslado a taller externo.',
      }
    }
    if (puede && motivo.length >= MIN_OVERRIDE) {
      if (auditarExcepcion) await auditarOverride(session, unidades, motivo, ahora)
      return {
        resultado: 'PERMITIDO',
        unidades,
        puedeAutorizar: true,
        via: 'OVERRIDE',
        mensaje: 'Salida autorizada por el encargado. Queda en la bitácora.',
      }
    }
    if (puede) {
      return {
        resultado: 'REQUIERE_AUTORIZACION',
        unidades,
        puedeAutorizar: true,
        mensaje: motivo
          ? 'Escribe un motivo de al menos 8 caracteres para autorizar la salida.'
          : mensajeBloqueo(unidades),
      }
    }
    return {
      resultado: 'BLOQUEADO',
      unidades,
      puedeAutorizar: false,
      mensaje: mensajeBloqueo(unidades),
    }
  }

  async function tablero(filtros = {}, now = clockOf(options)) {
    const yarda = filtros.yarda && filtros.yarda !== 'todas' ? String(filtros.yarda).trim().toLowerCase() : ''
    const abiertas = (await leerOts()).filter((ot) => otAbierta(ot) && (!yarda || ot.yarda === yarda))
    const orden = { rojo: 0, amarillo: 1, verde: 2 }
    const conSemaforo = abiertas.map((ot) => ({ ...ot, semaforo: computeSemaforo(ot.etr, now) }))
    conSemaforo.sort((a, b) => {
      const nivel = (orden[a.semaforo.nivel] ?? 9) - (orden[b.semaforo.nivel] ?? 9)
      if (nivel !== 0) return nivel
      return Date.parse(a.etr || '') - Date.parse(b.etr || '')
    })
    const grupos = new Map()
    for (const ot of conSemaforo) {
      const key = ot.yarda || 'sin-yarda'
      if (!grupos.has(key)) grupos.set(key, [])
      grupos.get(key).push(ot)
    }
    if (yarda && !grupos.has(yarda)) grupos.set(yarda, [])
    const porYarda = [...grupos.entries()].map(([nombre, ordenes]) => ({
      yarda: nombre,
      ordenes,
      resumen: resumenDe(ordenes),
    }))
    const estados = await leerEstados()
    return {
      yarda: yarda || null,
      generadoEn: now.toISOString(),
      resumen: resumenDe(conSemaforo),
      porYarda,
      estados,
    }
  }

  return {
    createOT,
    updateEstatus,
    updateEtr,
    listOTs,
    getOT,
    validarSalida,
    tablero,
    registrarEstatusOperativo,
    computeSemaforo,
  }
}

function resumenDe(ordenes) {
  const resumen = { verde: 0, amarillo: 0, rojo: 0, total: ordenes.length }
  for (const ot of ordenes) {
    const nivel = ot.semaforo?.nivel
    if (nivel && resumen[nivel] != null) resumen[nivel] += 1
  }
  return resumen
}
