/** Viajes cortos de yarda. El tipo sigue siendo salida o entrada. */

export const MOTIVOS_RAPIDO = Object.freeze([
  { id: 'lavado', label: 'Lavado' },
  { id: 'combustible', label: 'Combustible' },
  { id: 'tramite', label: 'Trámite' },
])

export function esMovimientoRapido(mov) {
  return mov?.rapido === true || mov?.cumplimiento?.rapido === true
}

export function motivoRapidoDe(mov) {
  return String(mov?.motivoRapido || mov?.cumplimiento?.motivoRapido || '')
    .trim()
    .toLowerCase()
}

export function etiquetaMotivoRapido(id) {
  const key = String(id || '')
    .trim()
    .toLowerCase()
  return MOTIVOS_RAPIDO.find((item) => item.id === key)?.label || ''
}

export function motivoRapidoValido(id) {
  return MOTIVOS_RAPIDO.some((item) => item.id === id)
}

/** Si observaciones va vacía, el historial igual ve el motivo. */
export function observacionesRapidas(texto, motivoId) {
  const nota = String(texto || '').trim()
  if (nota) return nota
  const label = etiquetaMotivoRapido(motivoId)
  return label ? `Rápido · ${label}` : 'Rápido'
}

export function tituloMovimiento(mov) {
  if (esMovimientoRapido(mov)) {
    return String(mov?.tipo || '').toLowerCase() === 'salida' ? 'Salida rápida' : 'Retorno rápido'
  }
  const tipo = String(mov?.tipo || '').toLowerCase()
  if (tipo === 'entrada') return 'Entrada'
  if (tipo === 'salida') return 'Salida'
  if (tipo === 'parado') return 'Parado'
  if (tipo === 'baja') return 'Baja'
  return 'Movimiento'
}
