/**
 * Conciliación GPS ↔ movimientos (Fase 5).
 * Compara la última posición de cada unidad con entradas/salidas en ±30 min
 * y deja alertas en AvisosLog. Sin credenciales de Frotcom no escribe nada.
 */

import { createAvisosService, fechaMx } from './avisosService.js'
import { proveedorGPS } from './gpsProvider.js'

export const VENTANA_GPS_MS = 30 * 60 * 1000

export function distanciaMetros(aLat, aLng, bLat, bLng) {
  const R = 6371000
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function leerGeocercas(env = process.env) {
  const raw = String(env.PATIO_GEOCERCAS_JSON || env.FROTCOM_GEOCERCAS_JSON || '').trim()
  if (!raw) return { geocercas: [], error: '' }
  try {
    const parsed = JSON.parse(raw)
    const list = Array.isArray(parsed) ? parsed : parsed?.yardas || parsed?.geocercas || []
    if (!Array.isArray(list)) return { geocercas: [], error: 'PATIO_GEOCERCAS_JSON no trae una lista de yardas.' }
    const geocercas = list
      .map((item) => ({
        yardaId: String(item?.yardaId || item?.yarda || '').trim().toLowerCase(),
        lat: Number(item?.lat),
        lng: Number(item?.lng ?? item?.lon),
        radioMetros: Number(item?.radioMetros || item?.radio || 400),
      }))
      .filter((geo) => geo.yardaId && Number.isFinite(geo.lat) && Number.isFinite(geo.lng))
    return { geocercas, error: '' }
  } catch {
    return { geocercas: [], error: 'PATIO_GEOCERCAS_JSON no es JSON válido.' }
  }
}

export function posicionEnGeocerca(pos, geo) {
  if (!geo) return false
  const lat = Number(pos?.lat)
  const lng = Number(pos?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  const radio = Number(geo.radioMetros) > 0 ? Number(geo.radioMetros) : 400
  return distanciaMetros(lat, lng, Number(geo.lat), Number(geo.lng)) <= radio
}

function normId(value) {
  return String(value || '').trim().toUpperCase().replace(/[\s-]/g, '')
}

function idsDe(pos) {
  return [normId(pos?.unidadId), normId(pos?.placa)].filter(Boolean)
}

function idsMov(mov) {
  return [normId(mov?.equipoId), normId(mov?.placa), normId(mov?.numeroEconomico)].filter(Boolean)
}

function mismaUnidad(mov, pos) {
  const keys = idsDe(pos)
  if (!keys.length) return false
  return idsMov(mov).some((key) => keys.includes(key))
}

function tiempoMov(mov) {
  const t = Date.parse(mov?.horaServidor || mov?.fechaHora || '')
  return Number.isFinite(t) ? t : NaN
}

function tiempoPos(pos, fallback) {
  const t = Date.parse(pos?.hora || '')
  return Number.isFinite(t) ? t : fallback
}

function esEntradaOSalida(mov) {
  const tipo = String(mov?.tipo || '').trim().toLowerCase()
  return tipo === 'entrada' || tipo === 'salida'
}

/**
 * @param {{ posiciones?: object[], movimientos?: object[], geocercas?: object[], ahora?: Date }} input
 */
export function conciliarGpsConMovimientos({ posiciones = [], movimientos = [], geocercas = [], ahora = new Date() } = {}) {
  const ahoraMs = ahora instanceof Date ? ahora.getTime() : new Date(ahora).getTime()
  const alertas = []
  const vistos = new Set()

  function push(alerta) {
    if (!alerta?.dedupeKey || vistos.has(alerta.dedupeKey)) return
    vistos.add(alerta.dedupeKey)
    alertas.push(alerta)
  }

  for (const pos of posiciones) {
    const geo = geocercas.find((item) => posicionEnGeocerca(pos, item))
    if (!geo) continue
    const tPos = tiempoPos(pos, ahoraMs)
    const confirma = movimientos.some((mov) => {
      if (!esEntradaOSalida(mov) || !mismaUnidad(mov, pos)) return false
      const t = tiempoMov(mov)
      return Number.isFinite(t) && Math.abs(t - tPos) <= VENTANA_GPS_MS
    })
    if (!confirma) {
      const unidad = pos.unidadId || pos.placa || 'sin-unidad'
      push({
        tipo: 'MOV_NO_REGISTRADO',
        yarda: geo.yardaId,
        unidadId: unidad,
        mensaje: `GPS en ${geo.yardaId} sin movimiento ±30 min · ${pos.placa || unidad}`,
        dedupeKey: `MOV_NO_REGISTRADO|${normId(unidad)}|${fechaMx(new Date(tPos))}`,
        detalle: `lat ${pos.lat} lng ${pos.lng}`,
      })
    }
  }

  for (const mov of movimientos) {
    if (!esEntradaOSalida(mov)) continue
    const t = tiempoMov(mov)
    if (!Number.isFinite(t) || Math.abs(t - ahoraMs) > VENTANA_GPS_MS) continue
    const yarda = String(mov.yardaId || mov.yarda || '').trim().toLowerCase()
    const geo = geocercas.find((item) => item.yardaId === yarda)
    const pos = posiciones.find((item) => mismaUnidad(mov, item))
    const tPos = pos ? tiempoPos(pos, NaN) : NaN
    const confirma = Boolean(pos && geo && posicionEnGeocerca(pos, geo) && Number.isFinite(tPos) && Math.abs(tPos - t) <= VENTANA_GPS_MS)
    if (!confirma) {
      const unidad = mov.equipoId || mov.placa || mov.id || 'sin-unidad'
      push({
        tipo: 'SIN_CONFIRMACION_GPS',
        yarda,
        unidadId: unidad,
        mensaje: `Movimiento ${String(mov.tipo).toLowerCase()} sin confirmación GPS ±30 min · ${mov.placa || unidad}`,
        dedupeKey: `SIN_CONFIRMACION_GPS|${mov.id || normId(unidad)}|${fechaMx(new Date(t))}`,
        detalle: pos ? `lat ${pos.lat} lng ${pos.lng}` : 'sin posición GPS',
      })
    }
  }

  return alertas
}

/**
 * @param {Record<string, Function>} repo
 * @param {{ env?: NodeJS.ProcessEnv, provider?: { ultimasPosiciones: Function }, fetch?: typeof fetch, now?: () => Date }} [options]
 */
export async function conciliarFrotcom(repo, options = {}) {
  const env = options.env ?? process.env
  const provider = options.provider ?? proveedorGPS(env, { fetch: options.fetch })
  const ahora = options.now ? options.now() : new Date()
  const lectura = await provider.ultimasPosiciones()
  if (lectura.dryRun) {
    return { ok: true, dryRun: true, alertas: [], mensaje: lectura.mensaje || 'Conciliación en seco.' }
  }

  const { geocercas, error } = leerGeocercas(env)
  if (error) return { ok: true, dryRun: false, alertas: [], mensaje: error }
  if (!geocercas.length) {
    return {
      ok: true,
      dryRun: false,
      alertas: [],
      mensaje: 'Sin geocercas en PATIO_GEOCERCAS_JSON. No se escribieron alertas.',
    }
  }

  const movimientos = typeof repo?.listMovimientos === 'function' ? await repo.listMovimientos() : []
  const propuestas = conciliarGpsConMovimientos({
    posiciones: lectura.posiciones || [],
    movimientos,
    geocercas,
    ahora,
  })

  const avisos = []
  if (propuestas.length && typeof repo?.appendAvisoLog === 'function') {
    const avisosSvc = createAvisosService(repo, { now: () => (ahora instanceof Date ? ahora : new Date(ahora)), env })
    for (const item of propuestas) {
      avisos.push(await avisosSvc.enqueue(item.tipo, item))
    }
  }

  return {
    ok: true,
    dryRun: false,
    alertas: propuestas,
    avisos: avisos.map((item) => ({ tipo: item.aviso?.tipo, skipped: Boolean(item.skipped), id: item.aviso?.id || '' })),
    posiciones: (lectura.posiciones || []).length,
    mensaje: propuestas.length
      ? `${propuestas.length} alerta(s) de conciliación GPS.`
      : 'GPS y movimientos coinciden en la ventana de ±30 min.',
  }
}
