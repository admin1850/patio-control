/** Orden de movimiento interno: ABIERTA → TOMADA → CERRADA. Al cerrar, el spot queda en `hacia`. */

export function crearOrden({ placa, desde, hacia, id, ahora = new Date() }) {
  const placaTxt = String(placa || '').trim().toUpperCase()
  if (!placaTxt) throw new Error('Falta la placa.')
  if (!String(hacia || '').trim()) throw new Error('Falta el spot de destino.')
  const cuando = (ahora instanceof Date ? ahora : new Date(ahora)).toISOString()
  return {
    id: id || `mp-${placaTxt}-${Date.parse(cuando)}`,
    placa: placaTxt,
    desde: String(desde || '').trim(),
    hacia: String(hacia).trim(),
    estatus: 'ABIERTA',
    quien: '',
    tomadaEn: '',
    cerradaEn: '',
    creadaEn: cuando,
  }
}

export function tomarOrden(orden, quien, ahora = new Date()) {
  if (!orden || orden.estatus !== 'ABIERTA') throw new Error('Solo se toma una orden abierta.')
  const nombre = String(quien || '').trim()
  if (!nombre) throw new Error('Falta quién toma la orden.')
  return { ...orden, estatus: 'TOMADA', quien: nombre, tomadaEn: (ahora instanceof Date ? ahora : new Date(ahora)).toISOString() }
}

export function cerrarOrden(orden, ahora = new Date()) {
  if (!orden || orden.estatus !== 'TOMADA') throw new Error('Solo se cierra una orden tomada.')
  return { ...orden, estatus: 'CERRADA', cerradaEn: (ahora instanceof Date ? ahora : new Date(ahora)).toISOString() }
}

/** Último cierre por placa: ese `hacia` es el spot actual. */
export function mapaSpots(ordenes) {
  const map = new Map()
  const cerradas = (ordenes || []).filter((orden) => orden?.estatus === 'CERRADA' && orden.cerradaEn)
  cerradas.sort((a, b) => Date.parse(a.cerradaEn) - Date.parse(b.cerradaEn))
  for (const orden of cerradas) map.set(orden.placa, orden.hacia)
  return [...map.entries()].map(([placa, spot]) => ({ placa, spot }))
}
