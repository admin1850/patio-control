/**
 * km/L entre dos capturas con kilómetros y litros de diésel.
 * Una lectura suelta no alcanza: hace falta el tramo anterior de la misma unidad.
 * Anomalía: menos de 0.8 km/L o más de 4.5 km/L (tracto de patio, no un auto).
 */

export const RENDIMIENTO_MIN = 0.8
export const RENDIMIENTO_MAX = 4.5

function num(value) {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(n) ? n : null
}

function tiempo(mov) {
  const t = Date.parse(mov?.fechaHora || mov?.horaServidor || '')
  return Number.isFinite(t) ? t : 0
}

export function tramosDiesel(movimientos) {
  const porUnidad = new Map()
  for (const mov of movimientos || []) {
    const id = String(mov?.equipoId || mov?.placa || '').trim()
    if (!id) continue
    if (!porUnidad.has(id)) porUnidad.set(id, [])
    porUnidad.get(id).push(mov)
  }
  const tramos = []
  for (const [unidadId, lista] of porUnidad) {
    const orden = [...lista].sort((a, b) => tiempo(a) - tiempo(b))
    let previo = null
    for (const mov of orden) {
      const km = num(mov.kilometros)
      const litros = num(mov.dieselLitros)
      if (previo && km != null && litros != null && previo.km != null && previo.litros != null) {
        const deltaKm = km - previo.km
        const deltaLitros = previo.litros - litros
        if (deltaKm > 0 && deltaLitros > 0) {
          const kmPorLitro = deltaKm / deltaLitros
          tramos.push({
            unidadId,
            placa: mov.placa || previo.placa || unidadId,
            operador: String(mov.operador || mov.chofer || '').trim(),
            desde: previo.fecha,
            hasta: mov.fechaHora || '',
            deltaKm,
            deltaLitros,
            kmPorLitro,
            anomalia: kmPorLitro < RENDIMIENTO_MIN || kmPorLitro > RENDIMIENTO_MAX,
          })
        }
      }
      if (km != null && litros != null) {
        previo = { km, litros, fecha: mov.fechaHora || '', placa: mov.placa }
      }
    }
  }
  return tramos
}

export function resumenDiesel(movimientos) {
  const tramos = tramosDiesel(movimientos)
  const prom = (lista) => {
    if (!lista.length) return null
    const sum = lista.reduce((acc, item) => acc + item.kmPorLitro, 0)
    return sum / lista.length
  }
  const porClave = (key) => {
    const map = new Map()
    for (const tramo of tramos) {
      const id = String(tramo[key] || '').trim()
      if (!id) continue
      if (!map.has(id)) map.set(id, [])
      map.get(id).push(tramo)
    }
    return [...map.entries()].map(([id, items]) => ({
      id,
      tramos: items.length,
      kmPorLitro: prom(items),
      anomalias: items.filter((item) => item.anomalia).length,
    }))
  }
  return {
    tramos,
    porUnidad: porClave('unidadId'),
    porOperador: porClave('operador'),
    anomalias: tramos.filter((item) => item.anomalia),
  }
}
