/**
 * Preaviso de App Chofer → pestaña LlegadasEsperadas.
 * PatioControl no llama a App Chofer: ellos hacen POST cuando el viaje sale.
 */

import { v4 as uuidv4 } from 'uuid'
import { llegadaToRow, rowToLlegada } from './sheetsRepo.js'

export function extraerViajeId(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return ''
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const obj = JSON.parse(text)
      const id = obj?.viajeId || obj?.viaje || obj?.id
      if (id) return String(id).trim().slice(0, 80)
    } catch {
      /* el texto no era JSON; se sigue con URL o token */
    }
  }
  try {
    const url = new URL(text)
    const q = url.searchParams.get('viajeId') || url.searchParams.get('viaje') || url.searchParams.get('id')
    if (q) return String(q).trim().slice(0, 80)
  } catch {
    /* no es URL */
  }
  const labeled = text.match(/viajeId\s*[=:]\s*["']?([A-Za-z0-9_.:-]{1,80})/i)
  if (labeled) return labeled[1]
  const compact = text.replace(/\s+/g, '')
  if (/^[A-Za-z0-9_.:-]{1,80}$/.test(compact)) return compact
  return text.slice(0, 80)
}

function readStringList(raw) {
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (item && typeof item === 'object') return String(item.placa || item.id || '').trim()
        return String(item ?? '').trim()
      })
      .filter(Boolean)
  }
  const text = String(raw).trim()
  if (text.startsWith('[')) {
    try {
      return readStringList(JSON.parse(text))
    } catch {
      return []
    }
  }
  return text.split(/[|,]/).map((part) => part.trim()).filter(Boolean)
}

function readCajas(raw) {
  if (Array.isArray(raw)) return raw
  if (raw == null || raw === '') return []
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    } catch {
      return []
    }
  }
  return String(raw).split(/[|,]/).map((part) => part.trim()).filter(Boolean)
}

function campoPresente(input, key) {
  if (!input || !Object.prototype.hasOwnProperty.call(input, key)) return false
  const value = input[key]
  if (value == null) return false
  if (typeof value === 'string' && value.trim() === '') return false
  if (Array.isArray(value) && value.length === 0) return false
  return true
}

export function normalizarPreaviso(input, { id, horaServidor, estatus, previo } = {}) {
  const viajeId = extraerViajeId(input?.viajeId ?? input?.qr ?? input?.q)
  if (!viajeId) {
    const err = new Error('Falta viajeId.')
    err.status = 400
    err.code = 'VIAJE'
    throw err
  }
  const estado = String(estatus || previo?.estatus || 'PENDIENTE').trim().toUpperCase() === 'RECIBIDA' ? 'RECIBIDA' : 'PENDIENTE'
  const base = previo && typeof previo === 'object' ? previo : {}
  return {
    id: id || base.id || '',
    viajeId: base.viajeId && String(base.viajeId).toLowerCase() === viajeId.toLowerCase() ? base.viajeId : viajeId,
    placas: campoPresente(input, 'placas') ? readStringList(input.placas) : readStringList(base.placas),
    cajas: campoPresente(input, 'cajas') ? readCajas(input.cajas) : readCajas(base.cajas),
    dolly: campoPresente(input, 'dolly') ? String(input.dolly).trim() : String(base.dolly || ''),
    sello: campoPresente(input, 'sello') ? String(input.sello).trim().toUpperCase() : String(base.sello || ''),
    cartaPorte: campoPresente(input, 'cartaPorte') || campoPresente(input, 'cartaPorteUuid')
      ? String(input.cartaPorte || input.cartaPorteUuid || '').trim()
      : String(base.cartaPorte || ''),
    eta: campoPresente(input, 'eta') ? String(input.eta).trim() : String(base.eta || ''),
    yardaId: campoPresente(input, 'yardaId') ? String(input.yardaId).trim().toLowerCase() : String(base.yardaId || ''),
    horaServidor: horaServidor || base.horaServidor || '',
    estatus: estado,
  }
}

function conSelloEsperado(llegada) {
  if (!llegada) return null
  return { ...llegada, selloEsperado: llegada.sello || '' }
}

/**
 * @param {{ listLlegadasEsperadas: Function, appendLlegadaEsperada: Function, updateLlegadaEsperadaById: Function }} repo
 * @param {{ now?: () => Date, newId?: () => string }} [options]
 */
export function createLlegadasService(repo, options = {}) {
  function newId() {
    return options.newId ? options.newId() : uuidv4()
  }
  function ahoraIso() {
    const value = options.now ? options.now() : new Date()
    const date = value instanceof Date ? value : new Date(value)
    return date.toISOString()
  }

  async function registrar(input) {
    const actuales = await repo.listLlegadasEsperadas()
    const viajeId = extraerViajeId(input?.viajeId ?? input?.qr ?? input?.q).toLowerCase()
    const previo = actuales.find((item) => String(item.viajeId || '').toLowerCase() === viajeId)
    const normal = normalizarPreaviso(input, {
      id: previo?.id || newId(),
      horaServidor: previo?.horaServidor || ahoraIso(),
      estatus: 'PENDIENTE',
      previo,
    })
    const row = llegadaToRow(normal)
    if (previo?.id) await repo.updateLlegadaEsperadaById(previo.id, row)
    else await repo.appendLlegadaEsperada(row)
    return { llegada: conSelloEsperado(rowToLlegada(row)), actualizada: Boolean(previo) }
  }

  async function listar({ yarda, estatus = 'PENDIENTE' } = {}) {
    let rows = await repo.listLlegadasEsperadas()
    const estado = String(estatus || 'PENDIENTE').trim().toUpperCase()
    if (estado && estado !== 'TODAS') rows = rows.filter((item) => item.estatus === estado)
    if (yarda && String(yarda).toLowerCase() !== 'todas') {
      const want = String(yarda).trim().toLowerCase()
      rows = rows.filter((item) => !item.yardaId || item.yardaId === want)
    }
    return rows.map(conSelloEsperado)
  }

  async function buscar(raw) {
    const viajeId = extraerViajeId(raw).toLowerCase()
    if (!viajeId) return null
    const rows = await repo.listLlegadasEsperadas()
    const misma = rows.filter((item) => String(item.viajeId || '').toLowerCase() === viajeId)
    const hit = misma.find((item) => item.estatus !== 'RECIBIDA') || misma[0]
    return conSelloEsperado(hit || null)
  }

  return { registrar, listar, buscar }
}

/** Marca el preaviso como recibido. No falla el movimiento si la pestaña no existe. */
export async function marcarLlegadaRecibida(repo, viajeId) {
  if (!viajeId || typeof repo?.listLlegadasEsperadas !== 'function' || typeof repo?.updateLlegadaEsperadaById !== 'function') {
    return null
  }
  try {
    const rows = await repo.listLlegadasEsperadas()
    const hit = rows.find((item) => String(item.viajeId).toLowerCase() === String(viajeId).toLowerCase() && item.estatus !== 'RECIBIDA')
    if (!hit?.id) return null
    const row = llegadaToRow({ ...hit, estatus: 'RECIBIDA' })
    await repo.updateLlegadaEsperadaById(hit.id, row)
    return rowToLlegada(row)
  } catch {
    return null
  }
}
