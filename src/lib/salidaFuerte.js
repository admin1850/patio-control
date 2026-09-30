/**
 * Reglas puras del gate de salida (Fase 3).
 * No muestran el sello esperado: el cliente solo envía lo capturado.
 */

export const MOTIVO_TRASLADO_TALLER = 'TRASLADO_TALLER_EXTERNO'
export const MIN_OVERRIDE = 8

export const ESTADOS_DANO = Object.freeze(['SIN_CAMBIO', 'DANO_NUEVO'])

const UUID_CARTA = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/
const LICENCIA_FEDERAL = /^[A-Z0-9-]{8,20}$/

const DIESEL_CATEGORIA = {
  reserva: 10,
  '1/4': 25,
  '1/2': 50,
  '3/4': 75,
  lleno: 100,
}

const SETPOINT_CATEGORIA = {
  'fresco-0-2': 1,
  'congelado-18-22': -20,
}

/** Ángulos de daño. `slotIds` son las fotos de la entrada que sirven de “antes”. */
export const ANGULOS_DANO = Object.freeze([
  { id: 'frontal', label: 'Frontal', slotIds: ['tractor-frontal', 'otro-general'] },
  { id: 'lateral-izq', label: 'Lateral izquierdo', slotIds: ['tractor-lat-izq', 'caja-costado-izq'] },
  { id: 'lateral-der', label: 'Lateral derecho', slotIds: ['tractor-lat-der', 'caja-costado-der'] },
  { id: 'trasera', label: 'Trasera / puertas', slotIds: ['caja-trasera', 'salida-puertas'] },
  { id: 'enganche', label: 'Enganche', slotIds: ['dolly-enganche', 'tractor-quinta'] },
  { id: 'lateral', label: 'Lateral', slotIds: ['dolly-luces', 'dolly-llantas'] },
])

export function normalizarSello(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

/** El sello de la entrada no se muestra antes ni después de capturar. */
export function debeMostrarSelloEntrada() {
  return false
}

export function textoAyudaSelloCiego() {
  return 'Captura el sello que ves en la puerta. El de la entrada no se muestra.'
}

/**
 * Vista de caseta. Ignora `selloEntrada` a propósito: no debe colarse en la UI ni en el JSON.
 * @param {{ capturado?: string, selloCapturado?: string, selloEntrada?: string }} [input]
 */
export function vistaSelloCiego(input = {}) {
  return {
    mostrarSelloEntrada: debeMostrarSelloEntrada(),
    ayuda: textoAyudaSelloCiego(),
    selloCapturado: normalizarSello(input.capturado ?? input.selloCapturado),
  }
}

/** Km y diésel de la salida empiezan vacíos: no se copian de la entrada. */
export function precargaKmDiesel() {
  return { km: '', dieselPct: '', dieselL: '' }
}

export function requiereSelloSalida(entrada, equipo) {
  if (!entrada) return false
  if (normalizarSello(entrada.selloNumero)) return true
  if (entrada.placaCaja1 || entrada.placaCaja2) return true
  const tipo = String(entrada.equipoTipo || equipo?.tipo || '').toLowerCase()
  return tipo === 'caja'
}

/**
 * Compara el sello capturado contra el de la entrada.
 * El motivo nunca incluye el valor esperado.
 * @returns {{ coincide: boolean | null, motivo: object | null }}
 */
export function evaluarSello({ selloCapturado, selloEntrada } = {}) {
  const esperado = normalizarSello(selloEntrada)
  const capturado = normalizarSello(selloCapturado)
  if (!esperado) return { coincide: null, motivo: null }
  if (!capturado) {
    return {
      coincide: false,
      motivo: {
        codigo: 'SELLO_FALTANTE',
        mensaje: 'Captura el sello de salida. El de la entrada no se muestra.',
      },
    }
  }
  if (capturado !== esperado) {
    return {
      coincide: false,
      motivo: {
        codigo: 'SELLO_NO_COINCIDE',
        mensaje: 'El sello capturado no coincide con el de la entrada.',
      },
    }
  }
  return { coincide: true, motivo: null }
}

export function uuidCartaPorteValido(value) {
  return UUID_CARTA.test(String(value ?? '').trim().toUpperCase())
}

export function licenciaFederalValida(value) {
  return LICENCIA_FEDERAL.test(String(value ?? '').trim().toUpperCase())
}

export function evaluarDocumentos({ cartaPorteUuid, licenciaFederal } = {}) {
  const uuid = String(cartaPorteUuid ?? '').trim().toUpperCase()
  const licencia = String(licenciaFederal ?? '').trim().toUpperCase()
  const motivos = []
  if (!uuidCartaPorteValido(uuid)) {
    motivos.push({
      codigo: 'CARTA_PORTE',
      mensaje: 'Falta el UUID de la Carta Porte (folio fiscal del CFDI) o no tiene el formato correcto.',
    })
  }
  if (!licenciaFederalValida(licencia)) {
    motivos.push({
      codigo: 'LICENCIA_FEDERAL',
      mensaje: 'Falta la licencia federal del operador o el formato no es válido.',
    })
  }
  return {
    motivos,
    cartaPorteUuid: uuidCartaPorteValido(uuid) ? uuid : '',
    licenciaFederal: licenciaFederalValida(licencia) ? licencia : '',
  }
}

export function leerKm(value) {
  if (value == null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(n)) return 'invalid'
  return n
}

export function ultimoKilometraje(movimientos, equipoId) {
  const want = String(equipoId ?? '').trim()
  let last = null
  for (const mov of movimientos ?? []) {
    if (String(mov?.equipoId ?? '').trim() !== want) continue
    const n = leerKm(mov.kilometros)
    if (typeof n === 'number') last = n
  }
  return last
}

/** Km menor al último registro no se autoriza: es dato, no excepción de patio. */
export function evaluarKm(km, ultimo) {
  const n = leerKm(km)
  if (n === 'invalid') {
    return {
      km: null,
      motivo: {
        codigo: 'KM_INVALIDO',
        duro: true,
        mensaje: 'Los kilómetros de la salida no son un número válido.',
      },
    }
  }
  if (n == null) return { km: null, motivo: null }
  if (ultimo != null && n < ultimo) {
    return {
      km: n,
      motivo: {
        codigo: 'KM_MENOR',
        duro: true,
        mensaje: `Los kilómetros (${n}) no pueden ser menores que el último registro (${ultimo}).`,
      },
    }
  }
  return { km: n, motivo: null }
}

function numeroConMapa(value, mapa) {
  if (value == null || value === '') return null
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase()
    if (mapa && Object.prototype.hasOwnProperty.call(mapa, key)) return mapa[key]
    if (mapa && Object.prototype.hasOwnProperty.call(mapa, value.trim())) return mapa[value.trim()]
  }
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(n) ? n : null
}

function presente(value) {
  return !(value == null || String(value).trim() === '')
}

function banderaRefrigerada(value) {
  return value === true || value === 'SI' || value === 'true' || value === 1
}

/**
 * Thermo obligatorio si la caja va refrigerada.
 * |temp − set| > 2 o diésel < 25 piden autorización (no son un bloqueo duro).
 */
export function evaluarThermo(input = {}) {
  const lleva = banderaRefrigerada(input.llevaRefrigerada)
  if (!lleva) return { presente: false, motivos: [], setPoint: null, tempReal: null, dieselThermo: null, horometro: null }
  const ref = input.refrigerada && typeof input.refrigerada === 'object' ? input.refrigerada : {}
  const setPoint = input.setPoint ?? ref.setPoint
  const tempReal = input.tempReal ?? input.temperaturaReal ?? ref.temperaturaReal ?? ref.tempReal
  const dieselThermo = input.dieselThermo ?? ref.dieselThermo
  const horometro = input.horometro ?? input.horometroThermo ?? ref.horometroThermo
  const motivos = []
  if (!presente(setPoint)) {
    motivos.push({ codigo: 'THERMO_SETPOINT', mensaje: 'La caja refrigerada exige el set point del Thermo.' })
  }
  if (!presente(tempReal) || !Number.isFinite(Number(tempReal))) {
    motivos.push({ codigo: 'THERMO_TEMP', mensaje: 'La caja refrigerada exige la temperatura real del display.' })
  }
  if (!presente(dieselThermo)) {
    motivos.push({ codigo: 'THERMO_DIESEL_FALTA', mensaje: 'La caja refrigerada exige el diésel del Thermo.' })
  }
  if (!presente(horometro) || !Number.isFinite(Number(horometro))) {
    motivos.push({ codigo: 'THERMO_HOROMETRO', mensaje: 'La caja refrigerada exige el horómetro del Thermo.' })
  }
  if (!motivos.length) {
    const setN = numeroConMapa(setPoint, SETPOINT_CATEGORIA)
    const tempN = Number(tempReal)
    if (setN != null && Number.isFinite(tempN) && Math.abs(tempN - setN) > 2) {
      motivos.push({
        codigo: 'THERMO_DELTA',
        mensaje: `Temperatura real ${tempN}°C: se aleja más de 2°C del set point (${setN}°C).`,
      })
    }
    const dieselN = numeroConMapa(dieselThermo, DIESEL_CATEGORIA)
    if (dieselN != null && dieselN < 25) {
      motivos.push({
        codigo: 'THERMO_DIESEL',
        mensaje: `Diésel del Thermo en ${dieselN} (menor a 25).`,
      })
    }
  }
  return { presente: true, motivos, setPoint, tempReal, dieselThermo, horometro }
}

/**
 * Combina motivos. Los duros (km) no los cubre un override.
 * Traslado a taller solo levanta el bloqueo de mantenimiento/baja.
 * @param {{ motivos?: object[], puedeAutorizar?: boolean, overrideMotivo?: string, traslado?: boolean }} input
 */
export function resolverGate(input = {}) {
  const motivos = Array.isArray(input.motivos) ? input.motivos.filter(Boolean) : []
  const duros = motivos.filter((item) => item.duro)
  let pendientes = motivos.filter((item) => !item.duro)
  const motivo = String(input.overrideMotivo || '').trim()
  const traslado = input.traslado === true || motivo === MOTIVO_TRASLADO_TALLER
  let via = null
  if (traslado) {
    const resto = pendientes.filter((item) => item.codigo !== 'MANTENIMIENTO')
    if (resto.length < pendientes.length) via = MOTIVO_TRASLADO_TALLER
    pendientes = resto
  }
  const overrideOk = Boolean(input.puedeAutorizar) && motivo.length >= MIN_OVERRIDE && motivo !== MOTIVO_TRASLADO_TALLER
  let advertencias = []
  if (overrideOk && pendientes.length) {
    advertencias = pendientes.map((item) => ({ codigo: item.codigo, mensaje: item.mensaje }))
    pendientes = []
    via = 'OVERRIDE'
  }
  const activos = [...duros, ...pendientes]
  let resultado = 'PERMITIDO'
  if (duros.length || (pendientes.length && !input.puedeAutorizar)) resultado = 'BLOQUEADO'
  else if (pendientes.length) resultado = 'REQUIERE_AUTORIZACION'
  if (resultado !== 'PERMITIDO') via = null
  return {
    resultado,
    motivos: activos,
    advertencias,
    via,
    puedeAutorizar: Boolean(input.puedeAutorizar),
  }
}

export function mensajeGate(resolved) {
  if (!resolved || resolved.resultado === 'PERMITIDO') {
    if (resolved?.via === 'OVERRIDE') return 'Salida autorizada por el encargado. Queda en la bitácora.'
    if (resolved?.via === MOTIVO_TRASLADO_TALLER) return 'Salida permitida por traslado a taller externo.'
    return 'Salida permitida.'
  }
  const textos = (resolved.motivos || []).map((item) => item.mensaje).filter(Boolean)
  if (resolved.resultado === 'REQUIERE_AUTORIZACION') {
    const pie = 'Un encargado de yarda puede autorizar con un motivo (mínimo 8 caracteres).'
    return textos.length ? `${textos.join(' ')} ${pie}` : pie
  }
  return textos.join(' ') || 'Salida bloqueada.'
}

export function normalizarEstadoDano(value) {
  const estado = String(value ?? '').trim().toUpperCase()
  return ESTADOS_DANO.includes(estado) ? estado : ''
}

export function angulosDeEquipo(equipoTipo, fotosEvidencia) {
  const tipo = String(equipoTipo || 'camion').toLowerCase()
  let ids = ['frontal', 'lateral-izq', 'lateral-der', 'trasera']
  if (tipo === 'caja') ids = ['lateral-izq', 'lateral-der', 'trasera']
  else if (tipo === 'dolly') ids = ['enganche', 'lateral']
  const fotos = Array.isArray(fotosEvidencia) ? fotosEvidencia : []
  return ids.map((id) => {
    const def = ANGULOS_DANO.find((item) => item.id === id)
    const prev = fotos.find((foto) => def.slotIds.includes(foto?.slotId) && foto?.url)
    return {
      id: def.id,
      label: def.label,
      entradaUrl: prev?.url || '',
      entradaSlotId: prev?.slotId || '',
    }
  })
}

export function faltanMarcasDano(angulos, marcas) {
  const map = marcas && typeof marcas === 'object' ? marcas : {}
  return (angulos || []).filter((angulo) => !normalizarEstadoDano(map[angulo.id]?.estado)).map((angulo) => angulo.id)
}
