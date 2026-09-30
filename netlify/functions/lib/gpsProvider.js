/**
 * Contrato ProveedorGPS (Fase 5).
 * Frotcom es un stub: lee FROTCOM_API_URL + FROTCOM_TOKEN y no exige esas
 * variables para que PatioControl arranque. El contrato HTTP real de Frotcom
 * (login, ruta y forma del JSON) se enchufa aquí cuando exista.
 *
 * @typedef {Object} PosicionGps
 * @property {string} unidadId
 * @property {string} placa
 * @property {number} lat
 * @property {number} lng
 * @property {string} hora ISO-8601
 * @property {string} proveedor
 *
 * @typedef {Object} LecturaGps
 * @property {PosicionGps[]} posiciones
 * @property {boolean} dryRun
 * @property {string} mensaje
 *
 * @typedef {Object} ProveedorGPS
 * @property {string} id
 * @property {string} nombre
 * @property {boolean} configurado
 * @property {() => Promise<LecturaGps>} ultimasPosiciones
 */

export function frotcomConfigurado(env = process.env) {
  return Boolean(String(env.FROTCOM_API_URL ?? '').trim() && String(env.FROTCOM_TOKEN ?? '').trim())
}

function num(value) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  return Number.isFinite(n) ? n : null
}

/**
 * Acepta un arreglo o un objeto con posiciones/positions/vehicles/data.
 * Campos de lat/lng y placa se leen con varios nombres para no amarrar el stub
 * a un JSON que Frotcom todavía no nos entregó.
 * @param {unknown} payload
 * @returns {PosicionGps[]}
 */
export function normalizarPosiciones(payload) {
  const list = Array.isArray(payload)
    ? payload
    : payload?.posiciones || payload?.positions || payload?.vehicles || payload?.data || []
  if (!Array.isArray(list)) return []
  return list
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const nested = item.position && typeof item.position === 'object' ? item.position : {}
      const lat = num(item.lat ?? item.latitude ?? nested.lat ?? nested.latitude)
      const lng = num(item.lng ?? item.lon ?? item.longitude ?? nested.lng ?? nested.lon ?? nested.longitude)
      if (lat == null || lng == null) return null
      const placa = String(item.placa || item.plate || item.licensePlate || '').trim()
      const unidadId = String(item.unidadId || item.vehicleId || item.id || placa || '').trim()
      const hora = String(item.hora || item.date || item.timestamp || item.lastCommunication || item.gpsDate || '').trim()
      return { unidadId, placa, lat, lng, hora, proveedor: 'frotcom' }
    })
    .filter(Boolean)
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ fetch?: typeof fetch }} [deps]
 * @returns {ProveedorGPS}
 */
export function proveedorGPS(env = process.env, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch
  const configurado = frotcomConfigurado(env)
  return {
    id: 'frotcom',
    nombre: 'Frotcom',
    configurado,
    async ultimasPosiciones() {
      if (!configurado) {
        return {
          posiciones: [],
          dryRun: true,
          mensaje: 'Frotcom sin credenciales (FROTCOM_API_URL y FROTCOM_TOKEN). Conciliación en seco.',
        }
      }
      const base = String(env.FROTCOM_API_URL).trim().replace(/\/$/, '')
      const url = /positions|vehicles|last/i.test(base) ? base : `${base}/vehicles/last-positions`
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${String(env.FROTCOM_TOKEN).trim()}`,
          Accept: 'application/json',
        },
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const err = new Error(`Frotcom respondió ${res.status}${text ? `: ${text.slice(0, 160)}` : ''}`)
        err.status = 502
        throw err
      }
      const payload = await res.json()
      return { posiciones: normalizarPosiciones(payload), dryRun: false, mensaje: '' }
    },
  }
}
