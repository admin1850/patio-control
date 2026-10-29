/** Lectura de llanta en la entrada. Si cambia el número o el DOT y no hay OT abierta, es alerta. */

export const POSICIONES_LLANTA = Object.freeze([
  { id: 'DI', label: 'Delantera izquierda' },
  { id: 'DD', label: 'Delantera derecha' },
  { id: 'TI', label: 'Trasera izquierda' },
  { id: 'TD', label: 'Trasera derecha' },
  { id: 'REF', label: 'Refacción' },
])

function norm(value) {
  return String(value || '').trim().toUpperCase()
}

export function cambioDeLlanta(anterior, captura) {
  if (!anterior) return false
  const numero = norm(anterior.numero) && norm(captura.numero) && norm(anterior.numero) !== norm(captura.numero)
  const dot = norm(anterior.dot) && norm(captura.dot) && norm(anterior.dot) !== norm(captura.dot)
  return Boolean(numero || dot)
}

export function hayOtAbierta(ordenes, placa) {
  const want = norm(placa)
  return (ordenes || []).some((ot) => norm(ot?.estatus) === 'ABIERTA' && (norm(ot.unidadId) === want || norm(ot.placa) === want))
}
