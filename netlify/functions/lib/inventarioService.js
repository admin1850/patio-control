/**
 * Inventario Fase 2: agregados por yarda, ocupación de slots y conteo físico.
 * Los ajustes de slot se escriben en la fila de EstadoUnidad y en Auditoria.
 * Nunca se limpia una pestaña.
 */

import { v4 as uuidv4 } from 'uuid'
import {
  ESTATUS_CARGA,
  TIPOS_SLOT,
  UBICACIONES_UNIDAD,
  conteoToRow,
  estadoUnidadToRow,
  rowToConteo,
  rowToEstadoUnidad,
  rowToZonaSlot,
  zonaSlotToRow,
} from './sheetsRepo.js'

export class InventarioError extends Error {
  constructor(message, status = 400, code = 'INVENTARIO') {
    super(message)
    this.name = 'InventarioError'
    this.status = status
    this.code = code
  }
}

const ESTATUS_OPERATIVOS = ['DISPONIBLE', 'EN_MANTENIMIENTO', 'DANADO_NO_OPERABLE', 'BAJA']

export function normClave(value) {
  return String(value ?? '').trim().toUpperCase()
}

/** Misma limpieza que la placa de la caseta, sin depender del cliente. */
export function normPlaca(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/\|/g, 'I')
    .replace(/[\s\-_.·•/,;:]+/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12)
}

export function normalizarUbicacion(value) {
  const t = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '_')
  return UBICACIONES_UNIDAD.includes(t) ? t : ''
}

export function normalizarCarga(value) {
  const t = String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
  if (!t) return 'NA'
  if (t === 'VACIO' || t === 'VACIA') return 'VACIA'
  if (t === 'CARGADO' || t === 'CARGADA') return 'CARGADA'
  if (t === 'EN_CARGA' || t === 'CARGA') return 'EN_CARGA'
  if (ESTATUS_CARGA.includes(t)) return t
  return 'NA'
}

export function normalizarTipoSlot(value) {
  const t = String(value ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return TIPOS_SLOT.includes(t) ? t : ''
}

export function enPatioFisico(estado) {
  const ubicacion = normalizarUbicacion(estado?.ubicacion)
  if (ubicacion) return ubicacion === 'EN_PATIO'
  return true
}

function yardaDe(estado) {
  return String(estado?.yarda || estado?.yardaId || '').trim().toLowerCase()
}

export function mismaYarda(estado, yarda) {
  const want = String(yarda || '').trim().toLowerCase()
  if (!want || want === 'todas') return true
  return yardaDe(estado) === want
}

function slotIdDe(yardaId, zona, slot) {
  return [normClave(yardaId), normClave(zona), normClave(slot)].join('|')
}

function resumenVacio() {
  return { capturas: [], faltantes: [], sobrantes: [], ajustes: [] }
}

function leerResumen(conteo) {
  const raw = conteo?.resumenJson
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return resumenVacio()
  return {
    capturas: Array.isArray(raw.capturas) ? raw.capturas : [],
    faltantes: Array.isArray(raw.faltantes) ? raw.faltantes : [],
    sobrantes: Array.isArray(raw.sobrantes) ? raw.sobrantes : [],
    ajustes: Array.isArray(raw.ajustes) ? raw.ajustes : [],
  }
}

/**
 * @param {Array<Record<string, any>>} estados
 * @param {Array<Record<string, any>>} [movimientos]
 */
export function indexPlacas(estados, movimientos = []) {
  const porEquipo = new Map()
  for (const mov of movimientos || []) {
    const placa = normPlaca(mov?.placa)
    const equipoId = String(mov?.equipoId || '').trim()
    if (equipoId && placa) porEquipo.set(equipoId, placa)
  }
  return (estados || []).map((estado) => {
    const unidadId = String(estado?.unidadId || '')
    return {
      ...estado,
      placa: porEquipo.get(unidadId) || normPlaca(estado?.placa) || '',
      estatusCargaNorm: normalizarCarga(estado?.estatusCarga),
      ubicacionNorm: normalizarUbicacion(estado?.ubicacion),
    }
  })
}

function placaDe(estado) {
  return normPlaca(estado?.placa) || normPlaca(estado?.unidadId)
}

/**
 * @param {Array<Record<string, any>>} unidades ya enriquecidas
 * @param {{ placa?: string, unidadId?: string }} ref
 */
export function resolverUnidad(unidades, ref) {
  const id = String(ref?.unidadId || '').trim()
  const placa = normPlaca(ref?.placa)
  if (id) {
    const porId = unidades.find((item) => item.unidadId === id)
    if (porId) return porId
  }
  if (placa) {
    const porPlaca = unidades.find((item) => normPlaca(item.placa) === placa)
    if (porPlaca) return porPlaca
    const porIdPlaca = unidades.find((item) => normPlaca(item.unidadId) === placa && normPlaca(item.unidadId).length >= 5)
    if (porIdPlaca) return porIdPlaca
  }
  return null
}

function claveCubo(yarda, tipo, operativo, carga) {
  return [yarda, tipo, operativo, carga].join('|')
}

/**
 * Agregados yarda × tipo × estatusOperativo y yarda × tipo × estatusCarga.
 * @param {Array<Record<string, any>>} unidades
 * @param {string} [yarda]
 */
export function agregarInventario(unidades, yarda) {
  const lista = (unidades || []).filter((item) => mismaYarda(item, yarda))
  const cubo = new Map()
  const operativo = new Map()
  const carga = new Map()
  let enPatio = 0
  let enRuta = 0
  let enTallerExterno = 0
  let enCliente = 0
  for (const item of lista) {
    const y = yardaDe(item) || 'sin_yarda'
    const tipo = String(item.tipo || 'sin_tipo').trim().toLowerCase() || 'sin_tipo'
    const estatusOperativo = String(item.estatusOperativo || 'SIN_ESTATUS').trim() || 'SIN_ESTATUS'
    const estatusCarga = item.estatusCargaNorm || normalizarCarga(item.estatusCarga)
    const ubicacion = item.ubicacionNorm || normalizarUbicacion(item.ubicacion)
    if (ubicacion === 'EN_RUTA') enRuta += 1
    else if (ubicacion === 'EN_TALLER_EXTERNO') enTallerExterno += 1
    else if (ubicacion === 'EN_CLIENTE') enCliente += 1
    else enPatio += 1
    const k = claveCubo(y, tipo, estatusOperativo, estatusCarga)
    cubo.set(k, (cubo.get(k) || 0) + 1)
    const ko = `${y}|${tipo}|${estatusOperativo}`
    operativo.set(ko, (operativo.get(ko) || 0) + 1)
    const kc = `${y}|${tipo}|${estatusCarga}`
    carga.set(kc, (carga.get(kc) || 0) + 1)
  }
  const partir = (map, campos) =>
    [...map.entries()]
      .map(([key, cantidad]) => {
        const partes = key.split('|')
        const row = { cantidad }
        campos.forEach((campo, i) => {
          row[campo] = partes[i]
        })
        return row
      })
      .sort((a, b) => String(a.yarda).localeCompare(b.yarda) || String(a.tipo).localeCompare(b.tipo) || b.cantidad - a.cantidad)
  return {
    resumen: {
      unidades: lista.length,
      enPatio,
      enRuta,
      enTallerExterno,
      enCliente,
    },
    porTipoEstatus: partir(cubo, ['yarda', 'tipo', 'estatusOperativo', 'estatusCarga']),
    porTipoOperativo: partir(operativo, ['yarda', 'tipo', 'estatusOperativo']),
    porTipoCarga: partir(carga, ['yarda', 'tipo', 'estatusCarga']),
    unidades: lista,
  }
}

function publicoEstado(estado) {
  return {
    unidadId: estado.unidadId,
    placa: estado.placa || '',
    tipo: estado.tipo || '',
    yarda: yardaDe(estado),
    zona: estado.zona || '',
    slot: estado.slot || '',
    ubicacion: normalizarUbicacion(estado.ubicacion) || estado.ubicacion || '',
    estatusOperativo: estado.estatusOperativo || '',
    estatusCarga: estado.estatusCargaNorm || normalizarCarga(estado.estatusCarga),
    clienteCarga: estado.clienteCarga || '',
    folioCarga: estado.folioCarga || '',
    enganchadaA: estado.enganchadaA || '',
    otAbiertaId: estado.otAbiertaId || '',
  }
}

/**
 * @param {Array<Record<string, any>>} slots
 * @param {Array<Record<string, any>>} unidades
 */
export function ocuparSlots(slots, unidades) {
  const catalogo = []
  const vistos = new Set()
  for (const slot of slots || []) {
    if (slot.activo === 'NO') continue
    const ocupantes = (unidades || []).filter(
      (item) =>
        enPatioFisico(item) &&
        yardaDe(item) === String(slot.yardaId || '').trim().toLowerCase() &&
        normClave(item.zona) === normClave(slot.zona) &&
        normClave(item.slot) === normClave(slot.slot),
    )
    vistos.add(slotIdDe(slot.yardaId, slot.zona, slot.slot))
    catalogo.push({
      id: slot.id,
      yardaId: slot.yardaId,
      zona: slot.zona,
      slot: slot.slot,
      tipo: slot.tipo,
      capacidad: Number(slot.capacidad) || 1,
      activo: slot.activo || 'SI',
      ocupantes: ocupantes.map(publicoEstado),
      sobreCupo: ocupantes.length > (Number(slot.capacidad) || 1),
      adHoc: false,
    })
  }
  for (const item of unidades || []) {
    if (!enPatioFisico(item) || !String(item.slot || '').trim()) continue
    const clave = slotIdDe(item.yarda, item.zona, item.slot)
    if (vistos.has(clave)) continue
    vistos.add(clave)
    const ocupantes = unidades.filter(
      (otro) =>
        enPatioFisico(otro) &&
        yardaDe(otro) === yardaDe(item) &&
        normClave(otro.zona) === normClave(item.zona) &&
        normClave(otro.slot) === normClave(item.slot),
    )
    catalogo.push({
      id: clave,
      yardaId: yardaDe(item),
      zona: item.zona || '',
      slot: item.slot,
      tipo: 'OTRO',
      capacidad: Math.max(1, ocupantes.length),
      activo: 'SI',
      ocupantes: ocupantes.map(publicoEstado),
      sobreCupo: false,
      adHoc: true,
    })
  }
  return catalogo.sort((a, b) => String(a.zona).localeCompare(b.zona, 'es') || String(a.slot).localeCompare(b.slot, 'es'))
}

function ultimasCapturas(capturas) {
  const map = new Map()
  for (const cap of capturas || []) {
    const key = normPlaca(cap?.placa) || `slot:${normClave(cap?.slot)}`
    map.set(key, cap)
  }
  return [...map.values()]
}

function enAlcance(estado, yardaId, zona) {
  if (!mismaYarda(estado, yardaId)) return false
  const z = String(zona || '').trim()
  if (!z) return true
  return normClave(estado.zona) === normClave(z)
}

/**
 * Faltantes, sobrantes y ajustes de slot. No escribe.
 * @param {{ estados: Array<Record<string, any>>, capturas: Array<Record<string, any>>, yardaId: string, zona?: string }} input
 */
export function planCierre(input) {
  const estados = input.estados || []
  const yardaId = String(input.yardaId || '').trim().toLowerCase()
  const zona = String(input.zona || '').trim()
  const capturas = ultimasCapturas(input.capturas || [])
  const esperadas = estados.filter((item) => enAlcance(item, yardaId, zona) && enPatioFisico(item) && item.estatusOperativo !== 'BAJA')
  const vistos = new Set()
  const sobrantes = []
  const ajustes = []
  for (const cap of capturas) {
    const est = resolverUnidad(estados, cap)
    const zonaNueva = String(cap.zona || zona || '').trim()
    const slotNuevo = String(cap.slot || '').trim()
    if (!est) {
      sobrantes.push({
        placa: normPlaca(cap.placa) || String(cap.placa || ''),
        slot: slotNuevo,
        zona: zonaNueva,
      })
      continue
    }
    vistos.add(est.unidadId)
    const ubicacion = normalizarUbicacion(est.ubicacion)
    const slotDistinto = normClave(est.slot) !== normClave(slotNuevo) || normClave(est.zona) !== normClave(zonaNueva) || yardaDe(est) !== yardaId
    const fueraDePatio = Boolean(ubicacion) && ubicacion !== 'EN_PATIO'
    if (!slotDistinto && !fueraDePatio) continue
    ajustes.push({
      unidadId: est.unidadId,
      placa: placaDe(est) || normPlaca(cap.placa),
      antes: {
        yarda: yardaDe(est),
        zona: est.zona || '',
        slot: est.slot || '',
        ubicacion: est.ubicacion || '',
      },
      despues: {
        yarda: yardaId,
        zona: zonaNueva,
        slot: slotNuevo,
        ubicacion: 'EN_PATIO',
      },
    })
  }
  const faltantes = esperadas.filter((item) => !vistos.has(item.unidadId)).map(publicoEstado)
  return { faltantes, sobrantes, ajustes }
}

/**
 * @param {{ listEstadoUnidad: Function, appendEstadoUnidad: Function, updateEstadoUnidadById: Function, listZonasSlots: Function, appendZonaSlot: Function, updateZonaSlotById: Function, listConteos: Function, appendConteo: Function, updateConteoById: Function, appendAuditoria?: Function, listMovimientos?: Function }} repo
 * @param {{ now?: () => Date, newId?: () => string }} [options]
 */
export function createInventarioService(repo, options = {}) {
  function newId() {
    return options.newId ? options.newId() : uuidv4()
  }

  function ahoraIso() {
    const fn = options.now || (() => new Date())
    const value = fn()
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
  }

  function exigirSesion(session) {
    if (!session?.email) throw new InventarioError('Sesión requerida.', 401, 'SESION')
  }

  async function auditar(entry) {
    if (typeof repo.appendAuditoria !== 'function') return
    try {
      await repo.appendAuditoria(entry)
    } catch (err) {
      console.warn('[inventario] Auditoria no disponible:', err?.message || err)
    }
  }

  async function leerTabOpcional(fn) {
    try {
      return await fn()
    } catch (err) {
      if (err?.code === 'NO_SHEET' || err?.status === 503) return null
      throw err
    }
  }

  async function leerEstados() {
    const estados = await repo.listEstadoUnidad()
    let movimientos = []
    if (typeof repo.listMovimientos === 'function') {
      try {
        movimientos = await repo.listMovimientos()
      } catch {
        movimientos = []
      }
    }
    return indexPlacas(Array.isArray(estados) ? estados : [], Array.isArray(movimientos) ? movimientos : [])
  }

  async function guardarEstado(estado) {
    const row = estadoUnidadToRow(estado)
    const actuales = await repo.listEstadoUnidad()
    const previo = (actuales || []).find((item) => item.unidadId === estado.unidadId)
    if (previo) await repo.updateEstadoUnidadById(previo.unidadId, row)
    else await repo.appendEstadoUnidad(row)
    return rowToEstadoUnidad(row)
  }

  async function consultar(session, { yarda } = {}) {
    exigirSesion(session)
    const estados = await leerEstados()
    const agregado = agregarInventario(estados, yarda)
    const slots = (await leerTabOpcional(() => repo.listZonasSlots())) || []
    const want = String(yarda || '').trim().toLowerCase()
    const slotsYard = slots.filter((slot) => !want || want === 'todas' || String(slot.yardaId).trim().toLowerCase() === want)
    const conteos = (await leerTabOpcional(() => repo.listConteos())) || []
    const abiertos = (conteos || []).filter((item) => item.activo !== 'NO' && !item.cerradoEn && (!want || want === 'todas' || String(item.yardaId).trim().toLowerCase() === want))
    return {
      yarda: want && want !== 'todas' ? want : 'todas',
      ...agregado,
      unidades: agregado.unidades.map(publicoEstado),
      slots: ocuparSlots(slotsYard, agregado.unidades),
      conteosAbiertos: abiertos.map((item) => ({
        id: item.id,
        yardaId: item.yardaId,
        zona: item.zona,
        iniciadoEn: item.iniciadoEn,
        usuarioEmail: item.usuarioEmail,
        capturas: leerResumen(item).capturas,
      })),
    }
  }

  async function listarSlots(session, { yarda, incluirInactivos = false } = {}) {
    exigirSesion(session)
    const slots = await repo.listZonasSlots()
    const want = String(yarda || '').trim().toLowerCase()
    return (slots || []).filter((slot) => {
      if (!incluirInactivos && slot.activo === 'NO') return false
      if (!want || want === 'todas') return true
      return String(slot.yardaId).trim().toLowerCase() === want
    })
  }

  async function guardarSlot(session, input) {
    exigirSesion(session)
    const yardaId = String(input?.yardaId || input?.yarda || '').trim().toLowerCase()
    const zona = String(input?.zona || '').trim()
    const slot = String(input?.slot || '').trim()
    const tipo = normalizarTipoSlot(input?.tipo)
    if (!yardaId) throw new InventarioError('Indica la yarda del slot.', 400, 'YARDA')
    if (!zona || !slot) throw new InventarioError('Zona y slot son obligatorios.', 400, 'SLOT')
    if (!tipo) throw new InventarioError(`Tipo de slot inválido. Usa ${TIPOS_SLOT.join(', ')}.`, 400, 'TIPO')
    const capacidadRaw = Number(input?.capacidad)
    const capacidad = Number.isFinite(capacidadRaw) && capacidadRaw > 0 ? Math.round(capacidadRaw) : 1
    const activo = String(input?.activo || 'SI').trim().toUpperCase() === 'NO' ? 'NO' : 'SI'
    const id = String(input?.id || '').trim() || slotIdDe(yardaId, zona, slot)
    const actuales = await repo.listZonasSlots()
    const previo = (actuales || []).find((item) => item.id === id || (normClave(item.yardaId) === normClave(yardaId) && normClave(item.zona) === normClave(zona) && normClave(item.slot) === normClave(slot)))
    const rowObj = {
      id: previo?.id || id,
      yardaId,
      zona,
      slot,
      tipo,
      capacidad,
      activo,
    }
    const row = zonaSlotToRow(rowObj)
    if (previo) await repo.updateZonaSlotById(previo.id, row)
    else await repo.appendZonaSlot(row)
    return rowToZonaSlot(row)
  }

  async function iniciarConteo(session, input) {
    exigirSesion(session)
    const yardaId = String(input?.yardaId || input?.yarda || '').trim().toLowerCase()
    const zona = String(input?.zona || '').trim()
    if (!yardaId) throw new InventarioError('Indica la yarda del conteo.', 400, 'YARDA')
    const conteos = await repo.listConteos()
    const abierto = (conteos || []).find(
      (item) => item.activo !== 'NO' && !item.cerradoEn && String(item.yardaId).trim().toLowerCase() === yardaId && normClave(item.zona) === normClave(zona),
    )
    if (abierto) return { conteo: abierto, idempotent: true }
    const conteo = {
      id: newId(),
      yardaId,
      zona,
      iniciadoEn: ahoraIso(),
      cerradoEn: '',
      usuarioEmail: String(session.email || '').trim().toLowerCase(),
      resumenJson: resumenVacio(),
      activo: 'SI',
    }
    await repo.appendConteo(conteoToRow(conteo))
    await auditar({
      usuarioEmail: conteo.usuarioEmail,
      rol: session.rol || '',
      accion: 'iniciar_conteo',
      entidad: 'ConteoFisico',
      entidadId: conteo.id,
      despues: { yardaId, zona },
      dispositivoId: session.dispositivoId || '',
    })
    return { conteo: rowToConteo(conteoToRow(conteo)), idempotent: false }
  }

  async function obtenerConteo(id) {
    const want = String(id || '').trim()
    if (!want) throw new InventarioError('Falta el id del conteo.', 400, 'ID')
    const conteos = await repo.listConteos()
    const conteo = (conteos || []).find((item) => item.id === want)
    if (!conteo) throw new InventarioError('No se encontró el conteo.', 404, 'NOT_FOUND')
    return conteo
  }

  function exigirAbierto(conteo) {
    if (conteo.activo === 'NO' || conteo.cerradoEn) {
      throw new InventarioError('Ese conteo ya está cerrado.', 409, 'CERRADO')
    }
  }

  async function capturar(session, id, input) {
    exigirSesion(session)
    const conteo = await obtenerConteo(id)
    exigirAbierto(conteo)
    const placa = normPlaca(input?.placa)
    const slot = String(input?.slot || '').trim()
    if (!placa) throw new InventarioError('Indica la placa.', 400, 'PLACA')
    if (!slot) throw new InventarioError('Indica el slot.', 400, 'SLOT')
    const resumen = leerResumen(conteo)
    const zona = String(input?.zona || conteo.zona || '').trim()
    const unidadId = String(input?.unidadId || '').trim()
    const captura = { slot, zona, placa, unidadId, en: ahoraIso() }
    const sinEsta = resumen.capturas.filter((item) => normPlaca(item.placa) !== placa)
    const siguiente = { ...resumen, capturas: [...sinEsta, captura] }
    const actualizado = { ...conteo, resumenJson: siguiente }
    await repo.updateConteoById(conteo.id, conteoToRow(actualizado))
    return { conteo: rowToConteo(conteoToRow(actualizado)), captura }
  }

  async function aplicarAjuste(session, ajuste, conteoId, ahora) {
    const actuales = await leerEstados()
    const previo = actuales.find((item) => item.unidadId === ajuste.unidadId)
    if (!previo) return null
    const estado = {
      unidadId: previo.unidadId,
      tipo: previo.tipo || '',
      yarda: ajuste.despues.yarda,
      zona: ajuste.despues.zona,
      slot: ajuste.despues.slot,
      ubicacion: 'EN_PATIO',
      estatusOperativo: previo.estatusOperativo || 'DISPONIBLE',
      estatusCarga: previo.estatusCarga || previo.estatusCargaNorm || 'NA',
      desde: previo.desde || ahora,
      otAbiertaId: previo.otAbiertaId || '',
      actualizadoEn: ahora,
      clienteCarga: previo.clienteCarga || '',
      folioCarga: previo.folioCarga || '',
      enganchadaA: previo.enganchadaA || '',
    }
    const guardado = await guardarEstado(estado)
    await auditar({
      usuarioEmail: String(session.email || '').trim().toLowerCase(),
      rol: session.rol || '',
      accion: 'ajuste_conteo_slot',
      entidad: 'EstadoUnidad',
      entidadId: previo.unidadId,
      antes: ajuste.antes,
      despues: { ...ajuste.despues, conteoId },
      dispositivoId: session.dispositivoId || '',
    })
    return guardado
  }

  async function cerrarConteo(session, id, input = {}) {
    exigirSesion(session)
    const conteo = await obtenerConteo(id)
    exigirAbierto(conteo)
    const estados = await leerEstados()
    const resumen = leerResumen(conteo)
    const plan = planCierre({
      estados,
      capturas: resumen.capturas,
      yardaId: conteo.yardaId,
      zona: conteo.zona,
    })
    const aplicar = input.aplicarAjustes !== false && input.aplicarAjustes !== 'false'
    const ahora = ahoraIso()
    const aplicados = []
    if (aplicar) {
      for (const ajuste of plan.ajustes) {
        const guardado = await aplicarAjuste(session, ajuste, conteo.id, ahora)
        if (guardado) aplicados.push({ ...ajuste, unidadId: guardado.unidadId })
      }
    }
    const cerrado = {
      ...conteo,
      cerradoEn: ahora,
      activo: 'NO',
      resumenJson: {
        capturas: resumen.capturas,
        faltantes: plan.faltantes,
        sobrantes: plan.sobrantes,
        ajustes: aplicar ? aplicados : plan.ajustes,
        ajustesAplicados: aplicar,
      },
    }
    await repo.updateConteoById(conteo.id, conteoToRow(cerrado))
    await auditar({
      usuarioEmail: String(session.email || '').trim().toLowerCase(),
      rol: session.rol || '',
      accion: 'cerrar_conteo',
      entidad: 'ConteoFisico',
      entidadId: conteo.id,
      despues: {
        faltantes: plan.faltantes.length,
        sobrantes: plan.sobrantes.length,
        ajustes: (aplicar ? aplicados : plan.ajustes).length,
      },
      dispositivoId: session.dispositivoId || '',
    })
    return {
      conteo: rowToConteo(conteoToRow(cerrado)),
      faltantes: plan.faltantes,
      sobrantes: plan.sobrantes,
      ajustes: aplicar ? aplicados : plan.ajustes,
    }
  }

  async function ubicarUnidad(session, input) {
    exigirSesion(session)
    const placa = normPlaca(input?.placa)
    const unidadId = String(input?.unidadId || input?.equipoId || '').trim()
    if (!unidadId && !placa) throw new InventarioError('Indica la unidad o la placa.', 400, 'UNIDAD')
    const estados = await leerEstados()
    const previo = resolverUnidad(estados, { unidadId, placa })
    const id = previo?.unidadId || unidadId || placa
    const tipoMov = String(input?.tipoMovimiento || input?.tipoMov || '').trim().toLowerCase()
    let ubicacion = normalizarUbicacion(input?.ubicacion)
    if (!ubicacion) {
      if (tipoMov === 'salida') ubicacion = 'EN_RUTA'
      else if (tipoMov === 'entrada' || tipoMov === 'parado') ubicacion = 'EN_PATIO'
      else ubicacion = normalizarUbicacion(previo?.ubicacion) || 'EN_PATIO'
    }
    const zonaIn = input?.zona == null ? null : String(input.zona).trim()
    const slotIn = input?.slot == null ? null : String(input.slot).trim()
    const yarda = String(input?.yarda || input?.yardaId || previo?.yarda || '').trim().toLowerCase()
    const operativoIn = String(input?.estatusOperativo || '').trim().toUpperCase()
    const operativo = ESTATUS_OPERATIVOS.includes(operativoIn) ? operativoIn : previo?.estatusOperativo || 'DISPONIBLE'
    const cargaIn = input?.estatusCarga == null || input?.estatusCarga === '' ? '' : normalizarCarga(input.estatusCarga)
    const estado = {
      unidadId: id,
      tipo: String(input?.tipo || input?.equipoTipo || previo?.tipo || '').trim(),
      yarda,
      zona: zonaIn == null || zonaIn === '' ? previo?.zona || '' : zonaIn,
      slot: slotIn == null || slotIn === '' ? previo?.slot || '' : slotIn,
      ubicacion,
      estatusOperativo: operativo,
      estatusCarga: cargaIn || previo?.estatusCarga || 'NA',
      desde: previo?.desde || ahoraIso(),
      otAbiertaId: previo?.otAbiertaId || '',
      actualizadoEn: ahoraIso(),
      clienteCarga: input?.clienteCarga == null ? previo?.clienteCarga || '' : String(input.clienteCarga),
      folioCarga: input?.folioCarga == null ? previo?.folioCarga || '' : String(input.folioCarga),
      enganchadaA: input?.enganchadaA == null ? previo?.enganchadaA || '' : String(input.enganchadaA),
    }
    const guardado = await guardarEstado(estado)
    const cambio =
      !previo ||
      yardaDe(previo) !== yarda ||
      normClave(previo.zona) !== normClave(estado.zona) ||
      normClave(previo.slot) !== normClave(estado.slot) ||
      (normalizarUbicacion(previo.ubicacion) || previo.ubicacion || '') !== ubicacion ||
      normalizarCarga(previo.estatusCarga) !== normalizarCarga(estado.estatusCarga) ||
      (previo.enganchadaA || '') !== estado.enganchadaA
    if (cambio) {
      await auditar({
        usuarioEmail: String(session.email || '').trim().toLowerCase(),
        rol: session.rol || '',
        accion: 'ubicar_unidad',
        entidad: 'EstadoUnidad',
        entidadId: id,
        antes: previo
          ? { yarda: yardaDe(previo), zona: previo.zona, slot: previo.slot, ubicacion: previo.ubicacion, estatusOperativo: previo.estatusOperativo }
          : null,
        despues: {
          yarda: estado.yarda,
          zona: estado.zona,
          slot: estado.slot,
          ubicacion: estado.ubicacion,
          estatusOperativo: estado.estatusOperativo,
          movimientoId: input?.movimientoId || '',
        },
        dispositivoId: session.dispositivoId || '',
      })
    }
    return guardado
  }

  return {
    consultar,
    listarSlots,
    guardarSlot,
    iniciarConteo,
    capturar,
    cerrarConteo,
    ubicarUnidad,
  }
}
