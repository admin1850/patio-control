/** Estadía: reloj desde que el GPS entra a la geocerca, contra horas libres del cliente. */

function norm(value) {
  return String(value || '').trim().toUpperCase().replace(/[\s-]/g, '')
}

function mismaPlaca(a, b) {
  const left = norm(a)
  const right = norm(b)
  return Boolean(left && right && left === right)
}

export function horasLibresDe(filas, cliente, fallback = 24) {
  const mark = (filas || []).find((row) => row?.id === `libre:${String(cliente || '').trim()}`)
  const n = Number(mark?.horasLibres)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/**
 * @param {{ posiciones?: object[], geocercas?: object[], dentro: Function, movimientos?: object[], abiertas?: object[], ahora?: Date }} input
 */
export function llegadasNuevas({ posiciones = [], geocercas = [], dentro, movimientos = [], abiertas = [], ahora = new Date() } = {}) {
  const cuando = ahora instanceof Date ? ahora : new Date(ahora)
  const propuestas = []
  for (const pos of posiciones) {
    const geo = geocercas.find((item) => dentro(pos, item))
    if (!geo) continue
    const placa = String(pos.placa || pos.unidadId || '').trim()
    if (!placa) continue
    const abierta = (abiertas || []).some((row) => row?.placa && !row.salida && mismaPlaca(row.placa, placa))
    if (abierta) continue
    const entrada = [...movimientos].reverse().find((mov) => String(mov?.tipo || '').toLowerCase() === 'entrada' && mismaPlaca(mov.placa, placa))
    const cliente = String(entrada?.cliente || 'sin-cliente').trim() || 'sin-cliente'
    propuestas.push({
      id: `est-${norm(placa)}-${cuando.getTime()}`,
      cliente,
      unidadId: String(pos.unidadId || placa),
      placa,
      yardaId: geo.yardaId || '',
      llegada: cuando.toISOString(),
      salida: '',
      horasLibres: horasLibresDe(abiertas, cliente),
    })
  }
  return propuestas
}

export function reporteEstadias(filas, ahora = new Date()) {
  const finDefault = (ahora instanceof Date ? ahora : new Date(ahora)).getTime()
  return (filas || [])
    .filter((fila) => fila?.placa && fila?.llegada && !String(fila.id || '').startsWith('libre:'))
    .map((fila) => {
      const ini = Date.parse(fila.llegada)
      const fin = fila.salida ? Date.parse(fila.salida) : finDefault
      const horas = Number.isFinite(ini) && Number.isFinite(fin) ? Math.max(0, (fin - ini) / 3600000) : 0
      const libres = Number(fila.horasLibres)
      const tope = Number.isFinite(libres) ? libres : 24
      const redondeo = (n) => Math.round(n * 10) / 10
      return {
        ...fila,
        horas: redondeo(horas),
        horasLibres: tope,
        excedente: redondeo(Math.max(0, horas - tope)),
      }
    })
}
